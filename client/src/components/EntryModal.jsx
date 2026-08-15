import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { MOOD_BG_CLASS as moodDotColors } from "../utils/moodColors";

// Full-screen read view for one journal entry -- extracted out of
// JournalHistoryPage.jsx so Dashboard's Recent Entries can reuse the exact
// same "click an entry, read the whole thing, Escape or backdrop to close"
// experience instead of only ever being able to navigate away to the full
// archive page. Takes a plain `entry` object ({ mood, createdAt, title,
// content, tags }) -- callers that already have the full entry (like
// JournalHistoryPage, which fetches full content per page) use this
// directly. Callers that only have a truncated excerpt (like Dashboard's
// Recent Entries, which only gets 110 characters from /dashboard/summary)
// use EntryModalById below instead.
export default function EntryModal({ entry, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!entry) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="ui-card rounded-2xl p-5 md:p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto scroll-area"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs text-white/60 capitalize">
              <span className={`h-2 w-2 rounded-full ${moodDotColors[entry.mood] || "bg-white/40"}`} />
              {entry.mood} ·{" "}
              <span className="ui-mono">
                {new Date(entry.createdAt).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </span>
            <h3 className="text-lg font-semibold mt-1">{entry.title || "Untitled entry"}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close entry"
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition shrink-0"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-white/85 whitespace-pre-wrap leading-relaxed mt-4">{entry.content}</p>
        {entry.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-4 mt-4 border-t border-white/10">
            {entry.tags.map((t) => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60 ui-mono">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Id-based variant -- fetches the full entry (GET /api/journal/:id) on
// mount, since callers like Dashboard's Recent Entries only ever have the
// truncated excerpt from /dashboard/summary, not the real content, until
// someone actually clicks to read one. Shows a small loading/error state
// inside the same modal chrome rather than waiting to open the modal at all
// until the fetch resolves, so the click gets instant visual feedback.
export function EntryModalById({ entryId, onClose, apiFetch }) {
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setEntry(null);
    setError("");
    apiFetch(`/api/journal/${entryId}`)
      .then((data) => {
        if (!cancelled) setEntry(data?.entry || null);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load that entry.");
      });
    return () => {
      cancelled = true;
    };
  }, [entryId, apiFetch]);

  if (error) {
    return (
      <div
        className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="ui-card rounded-2xl p-6 text-sm text-white/70" onClick={(e) => e.stopPropagation()}>
          {error}
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div
        className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="ui-card rounded-2xl p-6 text-sm text-white/60" onClick={(e) => e.stopPropagation()}>
          Loading entry...
        </div>
      </div>
    );
  }

  return <EntryModal entry={entry} onClose={onClose} />;
}
