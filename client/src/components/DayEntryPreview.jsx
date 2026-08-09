import { useEffect, useState } from "react";
import { apiFetch } from "../api";

// Shared "click a day, show what you wrote that day" preview card. Used by
// the Dashboard mood calendar and by the click-to-drill-down handlers on the
// Health and Retrospect charts -- there's no per-entry page anywhere else in
// the app to navigate to, so every one of these surfaces the entry inline
// instead.
export default function DayEntryPreview({ date }) {
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
    <div className="mt-3 rounded-xl p-3 bg-white/5 border border-white/10">
      <p className="text-[11px] text-[#d9d2b0]">{new Date(`${date}T00:00:00`).toDateString()}</p>
      {state.loading && <p className="text-sm text-white/60 mt-1">Loading...</p>}
      {!state.loading && state.entry && (
        <>
          <p className="text-sm text-white/85 mt-1">{state.entry.title || "Untitled entry"}</p>
          <p className="text-xs text-white/70 mt-1 line-clamp-3">{state.entry.content}</p>
        </>
      )}
      {!state.loading && !state.entry && <p className="text-sm text-white/60 mt-1">No entry found for that day.</p>}
    </div>
  );
}
