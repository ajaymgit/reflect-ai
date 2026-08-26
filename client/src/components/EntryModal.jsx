import { useEffect, useState } from "react";
import { X, Pencil, Trash2, Check } from "lucide-react";
import { apiFetch as sharedApiFetch, describeError } from "../api";
import { MOODS, MOOD_LABELS, moodDotStyle } from "../utils/moodColors";

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
  const [current, setCurrent] = useState(entry);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // Keep the locally-edited copy in sync if the caller ever hands this
  // component a genuinely different entry (e.g. History's page navigation
  // reusing the same mounted modal) rather than just re-rendering with the
  // same one after our own edit already updated `current`.
  useEffect(() => {
    setCurrent(entry);
    setEditing(false);
    setError("");
  }, [entry?._id]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!current) return null;

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

  async function handleDelete() {
    if (!window.confirm("Delete this entry? This can't be undone.")) return;
    setDeleting(true);
    setError("");
    try {
      await sharedApiFetch(`/api/journal/${current._id}`, { method: "DELETE" });
      onDeleted?.(current._id);
      onClose();
    } catch (err) {
      setError(describeError(err));
      setDeleting(false);
    }
  }

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
            {!editing && <h3 className="text-lg font-semibold mt-1">{current.title || "Untitled entry"}</h3>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!editing && (
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
                  onClick={handleDelete}
                  disabled={deleting}
                  aria-label="Delete entry"
                  title="Delete entry"
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-ink/70 hover:text-red-300 transition disabled:opacity-50"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close entry"
              className="p-1.5 rounded-lg hover:bg-ink/10 text-ink/70 hover:text-ink transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-red-300 mt-3">{error}</p>}

        {editing ? (
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
