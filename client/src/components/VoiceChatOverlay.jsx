import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX, X } from "lucide-react";
import useMicLevel from "../hooks/useMicLevel";
import useSpeechToText from "../hooks/useSpeechToText";

// A real hands-free spoken conversation with the AI -- ChatGPT/Siri-style
// voice mode, not a one-off voice note. You talk, it listens, transcribes,
// sends, replies out loud, then automatically starts listening again --
// no tapping between turns. This is deliberately built as a thin voice
// layer OVER the existing chat pipeline rather than a parallel one: `onSubmit`
// is literally ChatPage's own postChatMessage, so every voice-chat turn is
// the exact same request the text composer makes (same AI, same memory,
// same history) and lands in the same saved transcript. That also means no
// backend changes were needed for this feature at all -- speech-to-text and
// text-to-speech both happen entirely in the browser (SpeechRecognition /
// SpeechSynthesis), so there's no new server cost or new API key to manage.
//
// Turn-taking: while listening, ANY speech activity (interim or finalized)
// resets a short silence timer; once nothing new comes in for SILENCE_MS,
// whatever's been said so far is submitted automatically. Tapping the orb
// while listening submits immediately without waiting out the timer, and
// tapping it while the AI is talking interrupts (barge-in) and jumps
// straight back to listening -- the same two escape hatches real voice
// assistants give you.
const SILENCE_MS = 1500;

function average(levels) {
  if (!levels.length) return 0;
  return levels.reduce((a, b) => a + b, 0) / levels.length;
}

export default function VoiceChatOverlay({ turns, onSubmit, onClose }) {
  const [phase, setPhase] = useState("listening"); // listening | thinking | speaking
  const [muted, setMuted] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState("");
  const [permissionError, setPermissionError] = useState("");

  const silenceTimerRef = useRef(null);
  const pendingRef = useRef("");
  const lastTurnCountRef = useRef(turns.length);
  const closedRef = useRef(false);
  const phaseRef = useRef(phase);

  const mic = useMicLevel(28);

  useEffect(() => {
    pendingRef.current = pendingTranscript;
  }, [pendingTranscript]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  function resetSilenceTimer() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      const text = pendingRef.current.trim();
      if (text) submit(text);
    }, SILENCE_MS);
  }

  const speech = useSpeechToText({
    onResult: (text) => {
      setPendingTranscript((prev) => (prev ? `${prev} ${text}` : text));
      resetSilenceTimer();
    },
  });

  // Any live speech activity -- even not-yet-finalized interim text -- also
  // counts as "still talking" and pushes the silence timer back. Without
  // this, a long sentence that takes a couple seconds to finalize could get
  // cut off mid-thought purely because SpeechRecognition hadn't committed a
  // final result yet.
  useEffect(() => {
    if (phase !== "listening") return;
    if (speech.interimText) resetSilenceTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.interimText, phase]);

  function beginListening() {
    setPhase("listening");
    setPermissionError("");
    mic.start().catch(() => {});
    speech.start();
  }

  function submit(text) {
    const trimmed = text.trim();
    if (!trimmed || closedRef.current) return;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    speech.stop();
    mic.stop();
    setPendingTranscript("");
    setPhase("thinking");
    onSubmit(trimmed);
  }

  function interrupt() {
    window.speechSynthesis?.cancel();
    beginListening();
  }

  function handleOrbTap() {
    if (phase === "listening") {
      // Include interim text too, not just already-finalized pendingRef --
      // forcing an early send mid-word would otherwise silently drop
      // whatever SpeechRecognition hasn't finished committing yet, even
      // though it's still the best available guess at what was just said.
      const combined = [pendingRef.current, speech.interimText].filter(Boolean).join(" ");
      submit(combined);
    } else if (phase === "speaking") {
      interrupt();
    }
  }

  // Start listening the moment the overlay opens -- opening voice chat IS
  // the "I want to talk now" signal, no separate "start" tap needed.
  useEffect(() => {
    closedRef.current = false;
    mic.start().catch((err) => {
      setPermissionError(
        err?.name === "NotAllowedError"
          ? "Microphone access was denied -- allow it in your browser's site settings to use voice chat."
          : "Couldn't access your microphone.",
      );
    });
    speech.start();
    return () => {
      closedRef.current = true;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      speech.stop();
      mic.stop();
      window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately
    // mount/unmount-only: re-running this on every mic/speech identity
    // change would restart the mic mid-conversation.
  }, []);

  // Speaks the AI's reply as soon as it lands in `turns`, then resumes
  // listening once the utterance finishes -- this is what turns individual
  // request/response pairs into a continuous back-and-forth instead of a
  // one-shot voice command.
  useEffect(() => {
    if (turns.length <= lastTurnCountRef.current) {
      lastTurnCountRef.current = turns.length;
      return;
    }
    const newTurn = turns[turns.length - 1];
    lastTurnCountRef.current = turns.length;
    if (closedRef.current) return;

    if (muted || !newTurn?.aiResponse || typeof window.speechSynthesis === "undefined") {
      beginListening();
      return;
    }
    setPhase("speaking");
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(newTurn.aiResponse);
    utterance.lang = navigator.language || "en-US";
    utterance.onend = () => {
      if (!closedRef.current) beginListening();
    };
    utterance.onerror = () => {
      if (!closedRef.current) beginListening();
    };
    window.speechSynthesis.speak(utterance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns, muted]);

  const level = average(mic.levels);
  const label = permissionError
    ? "Microphone unavailable"
    : phase === "listening"
      ? "Listening..."
      : phase === "thinking"
        ? "Thinking..."
        : "Speaking...";
  const orbColor = phase === "listening" ? "rgb(var(--ember))" : "rgb(var(--signal))";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="ui-card rounded-2xl p-6 w-full max-w-sm flex flex-col items-center gap-5"
      >
        <div className="w-full flex items-center justify-between">
          <p className="ui-kicker">Voice chat</p>
          <button type="button" onClick={onClose} title="End voice chat" className="p-1.5 rounded-lg text-ink/50 hover:text-ink/80">
            <X size={16} />
          </button>
        </div>

        <button
          type="button"
          onClick={handleOrbTap}
          title={phase === "listening" ? "Tap to send now" : phase === "speaking" ? "Tap to interrupt" : undefined}
          className="relative w-32 h-32 rounded-full flex items-center justify-center"
          style={{ cursor: phase === "thinking" ? "default" : "pointer" }}
        >
          <motion.span
            animate={{
              scale: phase === "listening" ? 1 + level * 0.35 : phase === "thinking" ? [1, 1.06, 1] : [1, 1.1, 1],
            }}
            transition={
              phase === "listening"
                ? { duration: 0.12 }
                : { duration: phase === "thinking" ? 1.2 : 0.8, repeat: Infinity, ease: "easeInOut" }
            }
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: orbColor, opacity: 0.16 }}
          />
          <span className="relative w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: orbColor }}>
            {phase === "listening" && <ListeningBars levels={mic.levels} />}
            {phase === "thinking" && <ThinkingDots />}
            {phase === "speaking" && <SpeakingBars />}
          </span>
        </button>

        <div className="text-center min-h-[2.5rem]">
          <p className="text-sm text-ink/70">{label}</p>
          {permissionError && <p className="text-xs text-ember mt-1 max-w-[240px]">{permissionError}</p>}
          {!permissionError && phase === "listening" && (pendingTranscript || speech.interimText) && (
            <p className="text-xs italic text-ink/50 mt-1 max-w-[260px] line-clamp-2">
              {pendingTranscript} {speech.interimText}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            title={muted ? "Unmute AI replies" : "Mute AI replies"}
            aria-pressed={muted}
            className={`p-2.5 rounded-full border transition-colors ${
              muted ? "border-ember/40 bg-ember/10 text-ember" : "border-ink/15 text-ink/60 hover:text-ink"
            }`}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-full text-sm ui-button-ghost">
            End
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Small bar cluster driven by the same real per-frame amplitude data
// VoiceRecorder uses -- reacts to actual voice loudness, not a loop.
function ListeningBars({ levels }) {
  const sample = levels.filter((_, i) => i % 4 === 0); // thin 28 -> 7 for a compact in-orb cluster
  return (
    <div className="flex items-center gap-[3px] h-7">
      {sample.map((lvl, i) => (
        <span key={i} className="w-[3px] rounded-full bg-white" style={{ height: `${Math.round(lvl * 100)}%` }} />
      ))}
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          className="w-2 h-2 rounded-full bg-white"
        />
      ))}
    </span>
  );
}

// No real amplitude data exists for browser TTS output (SpeechSynthesis
// isn't connectable to a Web Audio AnalyserNode the way a mic stream is) --
// an honest scripted equalizer loop stands in for "the AI is talking" here,
// same tradeoff MicButton's own listening-state animation already makes
// elsewhere in this app for the same reason.
function SpeakingBars() {
  return (
    <div className="flex items-center gap-[3px] h-7">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span
          key={i}
          animate={{ scaleY: [0.3, 1, 0.4, 0.9, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: i * 0.09 }}
          className="w-[3px] h-full rounded-full bg-white origin-center"
        />
      ))}
    </div>
  );
}
