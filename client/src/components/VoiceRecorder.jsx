import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic, Send, Square, Trash2 } from "lucide-react";
import { apiFetch, describeError } from "../api";
import useMicLevel from "../hooks/useMicLevel";
import useSpeechToText from "../hooks/useSpeechToText";

// A real WhatsApp-style voice note: press the mic, see a live waveform that
// actually reacts to your voice (not a scripted animation), release/stop to
// preview what you recorded with real playback before deciding to send it,
// same as WhatsApp's own record -> preview -> send flow. This is a
// different feature from the dictation MicButton used elsewhere (Journal
// composer, this same Chat input) -- dictation silently discards the audio
// and only keeps the transcribed text; this component keeps and uploads the
// actual recording so it can be played back later exactly as spoken, with a
// transcript captioned underneath (matching WhatsApp's own "transcribe"
// feature for voice messages).
//
// Capped at 180 seconds server-side (see voiceNoteSchemas.js) -- enforced
// here too so a recording never has to be rejected after the fact.
const MAX_SECONDS = 180;
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
}

function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Downsamples a long array of raw amplitude readings (one per animation
// frame while recording, so potentially thousands for a long note) into a
// fixed number of bars by averaging each bucket -- keeps the preview
// waveform a real shape derived from this specific recording's actual
// loudness over time, not a decorative placeholder, while staying a fixed,
// cheap-to-render size regardless of how long the note was.
function downsample(samples, bars) {
  if (!samples.length) return Array.from({ length: bars }).map(() => 0.15);
  const out = [];
  const bucket = samples.length / bars;
  for (let i = 0; i < bars; i += 1) {
    const start = Math.floor(i * bucket);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucket));
    const slice = samples.slice(start, end);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    out.push(Math.max(0.12, Math.min(1, avg * 2.2)));
  }
  return out;
}

const LIVE_BARS = 32;
const PREVIEW_BARS = 40;

export default function VoiceRecorder({ onSend }) {
  const [phase, setPhase] = useState("idle"); // idle | recording | preview | uploading
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewBars, setPreviewBars] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0); // 0..1
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeTypeRef = useRef("");
  const timerRef = useRef(null);
  const audioElRef = useRef(null);
  const blobRef = useRef(null);

  // Real amplitude analysis of the live mic stream (see useMicLevel) so the
  // waveform genuinely reacts to how loud you're talking, not a scripted/
  // looping animation -- shared with VoiceChatOverlay's own "listening"
  // waveform.
  const mic = useMicLevel(LIVE_BARS);
  const speech = useSpeechToText({ onResult: (text) => setTranscript((t) => (t ? `${t} ${text}` : text)) });

  const supported =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof window !== "undefined" && Boolean(window.MediaRecorder);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    mic.stop();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mic.stop is a
    // useCallback-stable reference; including the whole `mic` object here
    // would re-run this cleanup effect on every level update.
  }, [previewUrl]);

  async function startRecording() {
    setError("");
    setTranscript("");
    try {
      const stream = await mic.start();
      const mimeType = pickMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 32000,
      });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => finishRecording();
      recorderRef.current = recorder;
      recorder.start();

      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startedAt) / 1000;
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS) stopRecording();
      }, 200);

      speech.start();
      setPhase("recording");
    } catch (err) {
      setError(
        err?.name === "NotAllowedError"
          ? "Microphone access was denied -- allow it in your browser's site settings to record a voice note."
          : "Couldn't start recording. Your device or browser may not support it.",
      );
    }
  }

  function stopRecording() {
    speech.stop();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    mic.stop();
  }

  function finishRecording() {
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || "audio/webm" });
    blobRef.current = blob;
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    setPreviewBars(downsample(mic.samplesRef.current, PREVIEW_BARS));
    setPhase("preview");
  }

  function discard() {
    if (audioElRef.current) {
      audioElRef.current.pause();
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPlaying(false);
    setPlayhead(0);
    setSeconds(0);
    setTranscript("");
    setError("");
    blobRef.current = null;
    setPhase("idle");
  }

  function togglePlayback() {
    const el = audioElRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play().catch(() => {});
    }
  }

  async function send() {
    if (!blobRef.current) return;
    setPhase("uploading");
    setError("");
    try {
      const audio = await blobToBase64(blobRef.current);
      const uploaded = await apiFetch("/api/voice-notes", {
        method: "POST",
        body: JSON.stringify({ audio, mimeType: mimeTypeRef.current || "audio/webm", durationSec: seconds }),
      });
      onSend?.({
        voiceNote: { id: uploaded.id, durationSec: uploaded.durationSec, mimeType: uploaded.mimeType },
        transcript: transcript.trim(),
        // Reused for this device's own bubble so playback works instantly
        // without a round trip back to the server for audio it just
        // uploaded -- see ChatPage's VoiceNotePlayer localUrl prop.
        localUrl: previewUrl,
        localBars: previewBars,
      });
      // Not revoking previewUrl here -- ownership passes to the sent turn's
      // bubble (localUrl above), which needs it to keep working. It'll
      // simply leak for the rest of the tab's lifetime, same tradeoff this
      // app already accepts elsewhere for short-lived object URLs.
      setPreviewUrl(null);
      setPlaying(false);
      setPlayhead(0);
      setSeconds(0);
      setTranscript("");
      blobRef.current = null;
      setPhase("idle");
    } catch (err) {
      setError(describeError(err));
      setPhase("preview");
    }
  }

  if (!supported) return null;

  if (phase === "idle") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={startRecording}
          title="Record a voice note"
          className="shrink-0 w-11 h-11 min-h-11 rounded-full flex items-center justify-center ui-button-primary"
        >
          <Mic size={18} />
        </button>
        {error && <p className="text-xs text-ember max-w-[220px] text-right">{error}</p>}
      </div>
    );
  }

  if (phase === "recording") {
    return (
      <div className="flex items-center gap-3 w-full ui-input py-2">
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          className="shrink-0 w-2.5 h-2.5 rounded-full bg-ember"
        />
        <span className="shrink-0 text-sm ui-mono text-ink/70 w-10">{formatDuration(seconds)}</span>
        <div className="flex-1 flex items-center gap-[2px] h-8 overflow-hidden">
          {mic.levels.map((lvl, i) => (
            <span
              key={i}
              className="flex-1 min-w-[2px] rounded-full bg-ember/70"
              style={{ height: `${Math.round(lvl * 100)}%` }}
            />
          ))}
        </div>
        <button type="button" onClick={discard} title="Cancel" className="shrink-0 p-2 rounded-lg text-ink/50 hover:text-ink/80">
          <Trash2 size={16} />
        </button>
        <button
          type="button"
          onClick={stopRecording}
          title="Stop recording"
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-ember text-white"
        >
          <Square size={13} fill="currentColor" />
        </button>
      </div>
    );
  }

  // preview / uploading
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-3 w-full ui-input py-2">
        <audio
          ref={audioElRef}
          src={previewUrl}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setPlayhead(0);
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.duration) setPlayhead(el.currentTime / el.duration);
          }}
        />
        <button
          type="button"
          onClick={togglePlayback}
          title={playing ? "Pause" : "Play"}
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-signal text-white"
        >
          {playing ? <Square size={11} fill="currentColor" /> : <PlayTriangle />}
        </button>
        <span className="shrink-0 text-sm ui-mono text-ink/70 w-10">{formatDuration(seconds)}</span>
        <div className="flex-1 flex items-center gap-[2px] h-8 overflow-hidden">
          {previewBars.map((lvl, i) => (
            <span
              key={i}
              className="flex-1 min-w-[2px] rounded-full"
              style={{ height: `${Math.round(lvl * 100)}%`, backgroundColor: i / previewBars.length <= playhead ? "rgb(var(--signal))" : "rgb(var(--ink) / 0.15)" }}
            />
          ))}
        </div>
        <button type="button" onClick={discard} title="Discard" className="shrink-0 p-2 rounded-lg text-ink/50 hover:text-ink/80">
          <Trash2 size={16} />
        </button>
        <button
          type="button"
          onClick={send}
          disabled={phase === "uploading"}
          title="Send"
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center ui-button-primary"
        >
          <Send size={14} />
        </button>
      </div>
      {/* Live/final transcript, editable before send -- speech recognition
          can mishear things, so this is a plain input rather than read-only
          text, consistent with this app never locking someone into an
          AI-generated guess about their own words. */}
      <input
        className="ui-input text-xs"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder={speech.supported ? "Transcript (auto-generated, edit if needed)..." : "Add a caption (no transcript available in this browser)..."}
      />
      {error && <p className="text-xs text-ember">{error}</p>}
    </div>
  );
}

function PlayTriangle() {
  return (
    <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor">
      <path d="M0 0L11 6L0 12V0Z" />
    </svg>
  );
}
