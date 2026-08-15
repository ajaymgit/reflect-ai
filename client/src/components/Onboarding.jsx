import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Gem, LineChart, PenSquare } from "lucide-react";

// First-run onboarding -- previously a brand-new account landed straight on
// Chat or Dashboard with zero explanation that Keepsakes exist, that entries
// can be sealed as time capsules, or that Retrospect builds up the more you
// write. This demonstrates each in one line rather than describing it in
// marketing copy, the same "show, don't tell" pattern the onboarding-
// gamification research behind this pass specifically calls out as reducing
// early drop-off. Shown once per account (see the localStorage flag in
// AppShell.jsx), skippable at any point.
const SLIDES = [
  {
    Icon: PenSquare,
    title: "Write freely",
    body: "Just write. Equoria quietly reads the tone of what you type and suggests a mood -- you always have the final say on what actually gets logged.",
  },
  {
    Icon: Gem,
    title: "Keepsakes",
    body: "Not every entry needs to be a keepsake. Flag the ones worth revisiting later, and they'll float by in your own private collection on Home.",
  },
  {
    Icon: Clock,
    title: "Time capsules",
    body: "Write a letter to a future version of yourself. Seal it with a reveal date, and it stays hidden -- even from you -- until that day arrives.",
  },
  {
    Icon: LineChart,
    title: "Retrospect & streaks",
    body: "The more you write, the more Retrospect can show you: real patterns in your mood over time, plus a streak that keeps the habit going.",
  },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="ui-card rounded-3xl p-8 max-w-md w-full text-center relative">
        <button
          type="button"
          onClick={onDone}
          className="absolute top-4 right-4 text-xs text-white/55 hover:text-white/70"
        >
          Skip
        </button>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25 }}
          >
            <div className="mx-auto h-14 w-14 rounded-full bg-[#8fae73]/20 border border-[#8fae73]/40 flex items-center justify-center">
              <slide.Icon size={26} className="text-[#8fae73]" />
            </div>
            <h3 className="ui-title text-2xl mt-4">{slide.title}</h3>
            <p className="text-sm text-white/70 mt-3 leading-6">{slide.body}</p>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-center gap-1.5 mt-6">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-[#8fae73]" : "w-1.5 bg-white/20"}`}
            />
          ))}
        </div>

        <div className="flex gap-2 mt-6">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 px-4 py-2.5 min-h-11 ui-button-ghost"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
            className="flex-1 px-4 py-2.5 min-h-11 ui-button-primary"
          >
            {isLast ? "Start journaling" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
