import { useEffect, useRef, useState } from "react";
import { X, Pencil, Trash2, Check, Undo2 } from "lucide-react";
import { motion } from "framer-motion";
import { apiFetch as sharedApiFetch, describeError } from "../api";
import { MOODS, MOOD_LABELS, moodDotStyle } from "../utils/moodColors";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";

// How long a delete stays undoable before it actually hits the server, in
// seconds -- see the pendingDelete state machine below.
const DELETE_UNDO_SECONDS = 5;

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
//
// `onUpdated`/`onDeleted` are optional -- every current caller passes them
// so its own list (Dashboard's Recent Entries, History's grid, On This
// Day's memories) stays in sync with an edit/delete made from inside this
// modal instead of only reflecting it after a manual page reload, but a
// caller that doesn't care can simply omit them and the buttons still work
// (the modal just closes on delete, or shows the edited copy until closed,
// without telling anyone else).
export default function EntryModal({ entry, onClose, onUpdated, onDeleted }) {
  const reducedMotion = usePrefersReducedMotion();
  const [current, setCurrent] = useState(entry);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Was a plain window.confirm() -- functional, but "delete, no way back"
  // is a harsh default for a journal (this is personal writing, not a
  // draft comment), and a blocking native confirm() dialog also can't be
  // scripted/automated cleanly. This replaces it with the same "deleted,
  // undo?" pattern Gmail popularized: the delete only actually reaches the
  // server after a few seconds with nothing else happening, and closing
  // the modal during that window cancels it rather than committing it (see
  // the cleanup effect below) -- so there's no way to lose an entry
  // without either waiting through the countdown or explicitly navigating
  // away mid-countdown and never coming back, both of which are much
  // harder to do by accident than a single misclick on a confirm() button.
  const [pendingDelete, setPendingDelete] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(DELETE_UNDO_SECONDS);
  const deleteTickRef = useRef(null);

  function clearDeleteTimer() {
    if (deleteTickRef.current) {
      clearInterval(deleteTickRef.current);
      deleteTickRef.current = null;
    }
  }

  // If the modal unmounts while a delete is still counting down (caller
  // stopped rendering it, e.g. the user navigated away entirely), just drop
  // the pending timer rather than letting a detached interval commit a
  // delete the user can no longer see or cancel -- silently deleting
  // something after someone has already moved on would be far more
  // surprising than the entry simply surviving.
  useEffect(() => () => clearDeleteTimer(), []);

  // Keep the locally-edited copy in sync if the caller ever hands this
  // component a genuinely different entry (e.g. History's page navigation
  // reusing the same mounted modal) rather than just re-rendering with the
  // same one after our own edit already updated `current`.
  useEffect(() => {
    setCurrent(entry);
    setEditing(false);
    setError("");
    setPendingDelete(false);
    clearDeleteTimer();
  }, [entry?._id]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDelete]);

  if (!current) return null;

  // Closing while a delete is pending reads as "changed my mind" (see the
  // comment above pendingDelete) -- everywhere in this file that used to
  // call `onClose` directly now calls this instead, so Escape, the X
  // button, and the backdrop all share the same cancel-if-pending behavior.
  function requestClose() {
    if (pendingDelete) {
      cancelDelete();
      return;
    }
    onClose();
  }

  function cancelDelete() {
    clearDeleteTimer();
    setPendingDelete(false);
    setSecondsLeft(DELETE_UNDO_SECONDS);
  }

  function startDelete() {
    setError("");
    setSecondsLeft(DELETE_UNDO_SECONDS);
    setPendingDelete(true);
    clearDeleteTimer();
    deleteTickRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearDeleteTimer();
          commitDelete();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function commitDelete() {
    try {
      await sharedApiFetch(`/api/journal/${current._id}`, { method: "DELETE" });
      onDeleted?.(current._id);
      onClose();
    } catch (err) {
      // The countdown already finished, so there's no "pending" UI left to
      // show this in -- fall back to a plain alert rather than silently
      // swallowing a failed delete (the entry is still there; the user
      // should know the delete didn't actually go through).
      window.alert(describeError(err) || "Couldn't delete that entry. Please try again.");
      setPendingDelete(false);
    }
  }

  function startEditing() {
    setError("");
    setDraft({
      title: current.title || "",
      content: current.content || "",
      mood: current.mood,
      tags: (current.tags || []).join(", "),
    });
    setEditing(true);
  }

  async function saveEdit() {
    const trimmedContent = draft.content.trim();
    if (!trimmedContent) {
      setError("Content can't be empty.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const tags = draft.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const { entry: updated } = await sharedApiFetch(`/api/journal/${current._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: draft.title,
          content: trimmedContent,
          mood: draft.mood,
          tags,
        }),
      });
      setCurrent(updated);
      setEditing(false);
      onUpdated?.(updated);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={reducedMotion ? undefined : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={requestClose}
    >
      <motion.div
        initial={reducedMotion ? undefined : { opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="ui-card rounded-2xl p-5 md:p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto scroll-area"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs text-ink/60 capitalize">
              <span className="h-2 w-2 rounded-full" style={moodDotStyle(current.mood)} />
              {current.mood} ·{" "}
              <span className="ui-mono">
                {new Date(current.createdAt).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </span>
            {!editing && !pendingDelete && <h3 className="text-lg font-semibold mt-1">{current.title || "Untitled entry"}</h3>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!editing && !pendingDelete && (
              <>
                <button
                  type="button"
                  onClick={startEditing}
                  aria-label="Edit entry"
                  title="Edit entry"
                  className="p-1.5 rounded-lg hover:bg-ink/10 text-ink/70 hover:text-ink transition"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={startDelete}
                  aria-label="Delete entry"
                  title="Delete entry"
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-ink/70 hover:text-red-300 transition"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close entry"
              className="p-1.5 rounded-lg hover:bg-ink/10 text-ink/70 hover:text-ink transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-red-300 mt-3">{error}</p>}

        {pendingDelete ? (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3.5">
            <p className="text-sm text-ink/85">
              Deleting this entry in <span className="ui-mono">{secondsLeft}</span>
              {secondsLeft === 1 ? " second" : " seconds"}...
            </p>
            <button
              type="button"
              onClick={cancelDelete}
              className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-ink/20 bg-ink/5 hover:bg-ink/10 text-sm font-medium transition"
            >
              <Undo2 size={14} />
              Undo
            </button>
          </div>
        ) : editing ? (
          <div className="mt-4 space-y-3">
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Entry title"
              className="w-full px-3 py-2 rounded-lg border border-ink/15 bg-ink/5 text-sm focus:outline-none focus:ring-2 focus:ring-signal/40"
            />
            <textarea
              value={draft.content}
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
              rows={8}
              className="w-full px-3 py-2 rounded-lg border border-ink/15 bg-ink/5 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-signal/40"
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, mood: m }))}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs capitalize transition ${
                    draft.mood === m ? "border-ink/40 bg-ink/10" : "border-ink/10 bg-ink/5 hover:bg-ink/10"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={moodDotStyle(m)} />
                  {MOOD_LABELS[m] || m}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={draft.tags}
              onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
              placeholder="tags (comma separated)"
              className="w-full px-3 py-2 rounded-lg border border-ink/15 bg-ink/5 text-sm focus:outline-none focus:ring-2 focus:ring-signal/40"
            />
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 ui-button-primary text-sm disabled:opacity-60"
              >
                <Check size={14} />
                {saving ? "Saving..." : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError("");
                }}
                disabled={saving}
                className="px-4 py-2 ui-button-ghost text-sm disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink/85 whitespace-pre-wrap leading-relaxed mt-4">{current.content}</p>
            {current.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-4 mt-4 border-t border-ink/10">
                {current.tags.map((t) => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-ink/10 text-ink/60 ui-mono">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// Id-based variant -- fetches the full entry (GET /api/journal/:id) on
// mount, since callers like Dashboard's Recent Entries only ever have the
// truncated excerpt from /dashboard/summary, not the real content, until
// someone actually clicks to read one. Shows a small loading/error state
// inside the same modal chrome rather than waiting to open the modal at all
// until the fetch resolves, so the click gets instant visual feedback.
export function EntryModalById({ entryId, onClose, apiFetch, onUpdated, onDeleted }) {
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState("");
  const fetcher = apiFetch || sharedApiFetch;

  useEffect(() => {
    let cancelled = false;
    setEntry(null);
    setError("");
    fetcher(`/api/journal/${entryId}`)
      .then((data) => {
        if (!cancelled) setEntry(data?.entry || null);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load that entry.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  if (error) {
    return (
      <div
        className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="ui-card rounded-2xl p-6 text-sm text-ink/70" onClick={(e) => e.stopPropagation()}>
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
        <div className="ui-card rounded-2xl p-6 text-sm text-ink/60" onClick={(e) => e.stopPropagation()}>
          Loading entry...
        </div>
      </div>
    );
  }

  return <EntryModal entry={entry} onClose={onClose} onUpdated={onUpdated} onDeleted={onDeleted} />;
}
