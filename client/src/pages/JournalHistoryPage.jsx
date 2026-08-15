import { useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch, describeError } from "../api";
import EntryModal from "../components/EntryModal";
import { MOODS as moods, MOOD_BG_CLASS as moodDotColors } from "../utils/moodColors";

// The archive view that was previously missing entirely from the app --
// every other place an old entry could be glimpsed (Dashboard's title-only
// cards, MoodCalendar's 3-line-clamped day preview, JournalPage's single
// "related previous entry" line) was a preview with no way to open the full
// text. Backed by GET /api/journal/entries (paginated, full content -- see
// server/src/modules/journal/routes.js).
//
// Previously its own standalone page/nav destination (/journal/history) --
// now embedded directly into JournalPage.jsx as its "History" tab instead,
// so there's one Journal section with two views (Write/History) rather than
// two separate places in the nav for what's fundamentally the same feature.
// No outer <main>/page wrapper here on purpose: the caller (JournalPage)
// already provides one, and nesting a second <main> would be invalid HTML.
// The old /journal/history route now just redirects into
// /journal/new?view=history (see App.jsx) so old links/bookmarks still work.
function truncateAtWord(text, maxLen) {
  if (!text || text.length <= maxLen) return text || "";
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const clean = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${clean}…`;
}

export default function JournalHistoryView() {
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [moodFilter, setMoodFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [availableTags, setAvailableTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openEntry, setOpenEntry] = useState(null);

  const load = useCallback(async (targetPage, mood, tag) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(targetPage), limit: "12" });
      if (mood) params.set("mood", mood);
      if (tag) params.set("tag", tag);
      const data = await apiFetch(`/api/journal/entries?${params.toString()}`);
      setEntries(data.entries || []);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Tags the user has actually used, ranked by frequency -- backed by GET
  // /api/journal/tags (see server/src/modules/journal/routes.js). Fetched
  // once, not tied to the current mood/tag filter, since the chip list
  // itself should represent everything available to filter by, not just
  // what's visible right now.
  useEffect(() => {
    apiFetch("/api/journal/tags")
      .then((data) => setAvailableTags(data.tags || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load(1, moodFilter, tagFilter);
    // Filter changes reset back to page 1 -- staying on e.g. page 3 of an
    // unfiltered list while switching to a mood with only 2 matching entries
    // would just show an empty page for no visible reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moodFilter, tagFilter]);

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="ui-kicker">Your journal</p>
            <h2 className="ui-title flex items-center gap-2">
              <BookOpen size={22} />
              All entries
            </h2>
            <p className="text-sm text-white/60 mt-1">
              {total > 0 ? `${total} ${total === 1 ? "entry" : "entries"}` : "No entries yet."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setMoodFilter("")}
              className={`px-3 py-1.5 rounded-lg border text-xs capitalize ${
                moodFilter === "" ? "border-white/40 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              All moods
            </button>
            {moods.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMoodFilter(m)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs capitalize ${
                  moodFilter === m ? "border-white/40 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${moodDotColors[m]}`} />
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Tag filter -- previously the only way to narrow the archive was
            by mood; tags (the words the user actually types themselves,
            e.g. "work", "family") had no filter at all. Only rendered once
            there's at least one real tag to filter by. */}
        {availableTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-white/55">Tags:</span>
            <button
              type="button"
              onClick={() => setTagFilter("")}
              className={`px-2.5 py-1 rounded-lg border text-xs ${
                tagFilter === "" ? "border-white/40 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              All
            </button>
            {availableTags.map(({ tag, count }) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter(tag)}
                className={`px-2.5 py-1 rounded-lg border text-xs ${
                  tagFilter === tag ? "border-white/40 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                {tag} <span className="text-white/55">{count}</span>
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-300">{error}</p>}

        {loading ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="ui-card rounded-2xl p-4 space-y-2.5">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-4/5" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="ui-card rounded-2xl p-6 text-center text-white/60 text-sm">
            {moodFilter || tagFilter
              ? `No entries match ${[moodFilter && `mood "${moodFilter}"`, tagFilter && `tag "${tagFilter}"`].filter(Boolean).join(" and ")}.`
              : "Nothing here yet -- write your first entry to start building your archive."}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {entries.map((entry) => (
              <button
                key={entry._id}
                type="button"
                onClick={() => setOpenEntry(entry)}
                className="ui-card rounded-2xl p-4 text-left hover:bg-white/10 transition space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs text-white/60 capitalize">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${moodDotColors[entry.mood] || "bg-white/40"}`} />
                    {entry.mood}
                  </span>
                  <span className="text-xs text-white/50 ui-mono">
                    {new Date(entry.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <p className="font-medium text-sm">{entry.title || "Untitled entry"}</p>
                <p className="text-sm text-white/70">{truncateAtWord(entry.content, 160)}</p>
                {entry.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {entry.tags.map((t) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60 ui-mono">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => load(page - 1, moodFilter, tagFilter)}
              className="p-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5"
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-white/60">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => load(page + 1, moodFilter, tagFilter)}
              className="p-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5"
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {openEntry && <EntryModal entry={openEntry} onClose={() => setOpenEntry(null)} />}
    </>
  );
}
