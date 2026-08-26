import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "../api";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";

// Shared "click a day, show what you wrote that day" preview card. Used by
// the Dashboard mood calendar and by the click-to-drill-down handlers on the
// Health and Retrospect charts -- there's no per-entry page anywhere else in
// the app to navigate to, so every one of these surfaces the entry inline
// instead.
export default function DayEntryPreview({ date }) {
  const reducedMotion = usePrefersReducedMotion();
  const [state, setState] = useState({ date: null, loading: false, entry: null });

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setState({ date, loading: true, entry: null });
    apiFetch(`/api/journal/by-date?date=${date}`)
      .then((data) => {
        if (!cancelled) setState({ date, loading: false, entry: data?.entry || null });
      })
      .catch(() => {
        if (!cancelled) setState({ date, loading: false, entry: null });
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  if (!date) return null;

  return (
    <motion.div
      key={date}
      initial={reducedMotion ? undefined : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="mt-3 rounded-xl p-3 bg-ink/5 border border-ink/10"
    >
      <p className="text-[11px] text-signal">{new Date(`${date}T00:00:00`).toDateString()}</p>
      {state.loading && <p className="text-sm text-ink/60 mt-1">Loading...</p>}
      {!state.loading && state.entry && (
        <>
          <p className="text-sm text-ink/85 mt-1">{state.entry.title || "Untitled entry"}</p>
          <p className="text-xs text-ink/70 mt-1 line-clamp-3">{state.entry.content}</p>
        </>
      )}
      {!state.loading && !state.entry && <p className="text-sm text-ink/60 mt-1">No entry found for that day.</p>}
    </motion.div>
  );
}
