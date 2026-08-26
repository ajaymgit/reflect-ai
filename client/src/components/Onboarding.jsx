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
      {/* Left-aligned, no icon-in-a-colored-circle badge, no dot-strip
          progress indicator -- that combination (centered card, circular
          icon badge, row of dots, Skip top-right) is the default output of
          basically every onboarding-carousel template/generator, and reading
          as one of those was a bigger tell than any single page's styling.
          Step count uses the app's own ui-mono convention (already how every
          stat/kicker/timestamp in the app marks "this is metadata") instead
          of a generic dot strip -- same information, in this app's own
          typographic language rather than a borrowed one. */}
      <div className="ui-card rounded-3xl p-8 max-w-md w-full relative">
        <div className="flex items-center justify-between">
          <p className="ui-mono text-xs text-ink/45">
            {String(step + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
          </p>
          <button type="button" onClick={onDone} className="text-xs text-ink/55 hover:text-ink/70">
            Skip
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25 }}
            className="mt-8"
          >
            <div className="flex items-center gap-2.5">
              <slide.Icon size={17} className="text-signal shrink-0" />
              <h3 className="ui-title text-2xl">{slide.title}</h3>
            </div>
            <p className="text-sm text-ink/70 mt-3 leading-6">{slide.body}</p>
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-2 mt-8">
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
