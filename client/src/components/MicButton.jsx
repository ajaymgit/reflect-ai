import { motion } from "framer-motion";
import { Mic } from "lucide-react";

// Shared by JournalPage's composer and ChatPage's message box -- previously
// each had its own copy of the same button, and "listening" was only shown
// as a plain pulsing icon (barely different from idle at a glance). A small
// animated waveform is the standard "actively hearing you" signal in every
// real dictation UI (Google's mic, Siri, Otter) -- three bars is enough to
// read as "listening" without needing a canvas/audio-level analyser, which
// would need its own getUserMedia stream separate from SpeechRecognition's
// own internal audio capture.
const barVariants = {
  idle: { scaleY: 0.4 },
  listening: (i) => ({
    scaleY: [0.35, 1, 0.5, 0.9, 0.35],
    transition: { duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.12 },
  }),
};

function Waveform() {
  return (
    <div className="flex items-center gap-[2.5px] h-3.5 w-3.5 justify-center">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          custom={i}
          variants={barVariants}
          animate="listening"
          className="w-[2.5px] h-full rounded-full bg-ember origin-center"
        />
      ))}
    </div>
  );
}

export default function MicButton({ speech, className = "", size = 14 }) {
  if (!speech.supported) return null;
  return (
    <button
      type="button"
      onClick={() => (speech.listening ? speech.stop() : speech.start())}
      aria-pressed={speech.listening}
      title={speech.listening ? "Stop dictating" : "Dictate with your voice"}
      className={`p-1.5 rounded-lg border transition-colors ${
        speech.listening
          ? "border-ember/40 bg-ember/10 text-ember"
          : "border-ink/15 bg-paper/80 text-ink/50 hover:text-ink hover:bg-ink/5"
      } ${className}`}
    >
      {speech.listening ? <Waveform /> : <Mic size={size} />}
    </button>
  );
}
