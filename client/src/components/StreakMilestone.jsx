import { useEffect, useState } from "react";
import { Flame, X } from "lucide-react";
import { motion } from "framer-motion";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";
import useDialogA11y from "../hooks/useDialogA11y";

// Celebrates the moment a journaling streak actually crosses 7/30/100 days --
// previously the streak-glow CSS tiers (see index.css's .streak-glow-1/2/3)
// only ever showed as a slightly brighter stat card with no single moment
// that said "you did it." Gamification research on streaks specifically
// flags pairing a streak with milestone celebrations as the highest-leverage,
// lowest-complexity engagement mechanic available -- this is that pairing,
// reusing the existing glow tiers rather than inventing new visual language.
// Fires once per milestone per device (tracked in localStorage), not once
// per render of a qualifying streak, so refreshing Dashboard on day 8 of a
// 7-day streak doesn't re-show the day-7 celebration.
const MILESTONES = [
  { days: 100, tier: 3, label: "100 days", detail: "A hundred days of showing up for yourself. That's a real practice now." },
  { days: 30, tier: 2, label: "30 days", detail: "A full month of journaling. Whatever this is doing for you, it's working." },
  { days: 7, tier: 1, label: "One week", detail: "Seven days in a row. The hardest part of a habit is usually the first week." },
];

const STORAGE_KEY = "equoria-streak-milestone-seen";

function lastCelebrated() {
  try {
    return Number(localStorage.getItem(STORAGE_KEY) || 0);
  } catch {
    return 0;
  }
}

function markCelebrated(days) {
  try {
    localStorage.setItem(STORAGE_KEY, String(days));
  } catch {
    // ignore -- worst case it re-celebrates once next session
  }
}

export default function StreakMilestone({ streak }) {
  const reducedMotion = usePrefersReducedMotion();
  const [milestone, setMilestone] = useState(null);

  useEffect(() => {
    if (!Number.isFinite(streak) || streak <= 0) return;
    const seen = lastCelebrated();
    const hit = MILESTONES.find((m) => streak >= m.days && m.days > seen);
    if (hit) setMilestone(hit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak]);

  // Called unconditionally (before the `if (!milestone) return null` below,
  // per the rules of hooks) with `active: !!milestone` so the hook's own
  // Escape listener/focus management only actually engages once there's a
  // real milestone card on screen.
  const dialogRef = useDialogA11y(() => milestone && dismiss(), { active: !!milestone });

  if (!milestone) return null;

  function dismiss() {
    markCelebrated(milestone.days);
    setMilestone(null);
  }

  return (
    <motion.div
      initial={reducedMotion ? undefined : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
      onClick={dismiss}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Streak milestone: ${milestone.label}`}
        tabIndex={-1}
        initial={reducedMotion ? undefined : { opacity: 0, y: 24, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reducedMotion ? undefined : { type: "spring", stiffness: 340, damping: 22 }}
        className={`ui-card streak-glow-${milestone.tier} rounded-2xl p-6 max-w-sm w-full text-center relative outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-ink/10 transition"
        >
          <X size={15} className="text-ink/60" />
        </button>
        <motion.div
          initial={reducedMotion ? undefined : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={reducedMotion ? undefined : { delay: 0.15, type: "spring", stiffness: 400, damping: 16 }}
          className="mx-auto h-14 w-14 rounded-full bg-[#e8ab5f]/20 border border-[#e8ab5f]/40 flex items-center justify-center"
        >
          <Flame size={26} className="text-[#e8ab5f]" />
        </motion.div>
        <p className="ui-kicker mt-4">Streak milestone</p>
        <h3 className="ui-title text-2xl mt-1">{milestone.label}</h3>
        <p className="text-sm text-ink/70 mt-2 leading-6">{milestone.detail}</p>
        <button type="button" onClick={dismiss} className="mt-5 w-full px-4 py-2.5 min-h-11 ui-button-primary">
          Keep going
        </button>
      </motion.div>
    </motion.div>
  );
}
