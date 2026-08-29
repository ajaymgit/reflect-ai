import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "../api";

// Playback side of the WhatsApp-style voice note flow (see VoiceRecorder.jsx
// for recording/sending). Deliberately lazy: a chat history turn only ever
// carries { id, durationSec, mimeType } (see models/ChatSession.js), never
// the audio bytes themselves, so this component only fetches the real
// recording from GET /api/voice-notes/:id the first time someone actually
// presses play -- the same "don't ship the heavy payload until it's
// needed" reasoning documented on the server route. A just-sent note skips
// that fetch entirely via the `localUrl`/`localBars` props (the browser
// already has the recording it just made -- no reason to round-trip back to
// the server to play back your own voice).
const BARS = 40;

function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i += 1) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

// Real per-bucket RMS loudness computed from the actual decoded PCM samples
// -- not a placeholder pattern -- so a voice note loaded fresh from history
// gets just as genuine a waveform shape as one that was just recorded (which
// already has one from VoiceRecorder's live amplitude capture, passed in as
// `localBars`).
function waveformFromChannel(channelData, bars) {
  const bucket = Math.floor(channelData.length / bars) || 1;
  const out = [];
  for (let i = 0; i < bars; i += 1) {
    const start = i * bucket;
    const end = Math.min(channelData.length, start + bucket);
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += channelData[j] * channelData[j];
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    out.push(Math.max(0.12, Math.min(1, rms * 4)));
  }
  return out;
}

function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function VoiceNotePlayer({ voiceNote, localUrl, localBars }) {
  const [url, setUrl] = useState(localUrl || null);
  const [bars, setBars] = useState(localBars?.length ? localBars : Array.from({ length: BARS }).map(() => 0.18));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const audioRef = useRef(null);

  async function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      return;
    }
    let src = url;
    if (!src) {
      setLoading(true);
      setError("");
      try {
        const res = await apiFetch(`/api/voice-notes/${voiceNote.id}`);
        const blob = base64ToBlob(res.audio, res.mimeType || voiceNote.mimeType);
        src = URL.createObjectURL(blob);
        setUrl(src);
        // Best-effort real waveform from the decoded audio -- if decoding
        // fails for any reason (an unsupported codec in this particular
        // browser, say), playback itself still works fine via the <audio>
        // element regardless; only the visual waveform falls back to the
        // flat placeholder.
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          const ctx = new AudioCtx();
          const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
          setBars(waveformFromChannel(decoded.getChannelData(0), BARS));
          ctx.close();
        } catch {
          // Keep the placeholder bars -- not fatal.
        }
      } catch {
        setError("Couldn't load this voice note.");
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    el.src = src;
    el.play().catch(() => setError("Couldn't play this voice note."));
  }

  return (
    <div className="flex items-center gap-2.5 min-w-[220px]">
      <audio
        ref={audioRef}
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
        onClick={togglePlay}
        disabled={loading}
        title={playing ? "Pause" : "Play"}
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-signal text-white disabled:opacity-60"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="flex-1 flex items-center gap-[2px] h-6">
        {bars.map((lvl, i) => (
          <span
            key={i}
            className="flex-1 min-w-[2px] rounded-full transition-colors"
            style={{
              height: `${Math.round(lvl * 100)}%`,
              backgroundColor: i / bars.length <= playhead ? "rgb(var(--signal))" : "rgb(var(--ink) / 0.18)",
            }}
          />
        ))}
      </div>
      <span className="shrink-0 text-[11px] ui-mono text-ink/50">{formatDuration(voiceNote.durationSec)}</span>
      {error && <span className="text-[11px] text-ember">{error}</span>}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="10" height="11" viewBox="0 0 11 12" fill="currentColor">
      <path d="M0 0L11 6L0 12V0Z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <rect x="0" y="0" width="3.5" height="10" rx="1" />
      <rect x="6.5" y="0" width="3.5" height="10" rx="1" />
    </svg>
  );
}
