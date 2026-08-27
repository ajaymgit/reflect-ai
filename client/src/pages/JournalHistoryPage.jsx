import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, ChevronLeft, ChevronRight, Gem, Pencil, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { apiFetch, describeError } from "../api";
import EntryModal, { EntryModalById } from "../components/EntryModal";
import { MOODS as moods, MOOD_LABELS, moodDotStyle } from "../utils/moodColors";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";

// Same fade-and-rise entrance the other main pages use for the header, plus
// a per-card reveal for the entries grid -- previously this was the third
// (with Settings and More) of the app's main destinations still popping in
// with a hard instant cut.
const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};
const staticContainerVariants = { hidden: {}, visible: {} };
const staticItemVariants = { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } };

// How many tags show by default before the cloud collapses behind "Show
// more" -- previously all 20-30 tags a person accumulates rendered at once,
// at equal visual weight, ahead of any actual journal content. Ranked by
// frequency (the count the API already returns) so the tags that actually
// matter surface first instead of an alphabetical-ish wall.
const VISIBLE_TAG_COUNT = 8;

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
  const reducedMotion = usePrefersReducedMotion();
  const cVariants = reducedMotion ? staticContainerVariants : containerVariants;
  const iVariants = reducedMotion ? staticItemVariants : itemVariants;
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [moodFilter, setMoodFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  // Keepsakes-only toggle -- previously the only places a Keepsake could be
  // browsed at all were the small globe launcher on Dashboard (no paging, no
  // way to combine with mood/tag) or by scrolling the full unfiltered
  // archive looking for the flag. Backed by GET /api/journal/entries?keepsake=true
  // (see server/src/modules/journal/routes.js), composes with mood/tag the
  // same way they compose with each other since all three narrow the same
  // underlying Mongo filter.
  const [keepsakeOnly, setKeepsakeOnly] = useState(false);
  const [availableTags, setAvailableTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openEntry, setOpenEntry] = useState(null);
  // Filters start collapsed -- previously the mood-pill row and the full tag
  // cloud rendered open by default, every time, pushing the actual entry
  // list below the fold before you'd even touched a filter. Now they're
  // tucked behind one "Filter" button, and only take up space once you
  // actually want to narrow something down.
  const [showFilters, setShowFilters] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

  // Renaming/removing a tag across every entry that has it -- previously the
  // only way to fix a typo'd tag ("wrok" instead of "work") was to open and
  // hand-edit every single entry that has it, one at a time. Backed by
  // PATCH /api/journal/tags/rename (see server/src/modules/journal/routes.js),
  // which rewrites `from` -> `to` across this user's own entries in one call
  // (an empty `to` removes the tag entirely). `editingTag` tracks which
  // chip's inline editor is open, not a separate modal -- keeps this
  // lightweight for what's meant to be an occasional cleanup action, not a
  // whole new page.
  const [editingTag, setEditingTag] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState("");

  // Meaning-based search over this same archive -- previously the semantic
  // search endpoint (GET /api/journal/search) was only reachable from the
  // Write page's sidebar, nowhere near the actual "browse my past entries"
  // page someone would naturally reach for it from. Kept as a self-contained
  // block (its own query/results/mode state, not woven into the mood/tag
  // filter's page-based `load()`) since search results aren't paginated the
  // same way and the two shouldn't be combined into one query shape.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchMode, setSearchMode] = useState("empty_query");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [openSearchEntryId, setOpenSearchEntryId] = useState(null);

  // Guards against out-of-order responses: clicking one mood pill then
  // another (or a filter change landing right as a page-change request was
  // already in flight) previously fired two overlapping GET requests with
  // nothing to enforce ordering on the way back. If the first (now-stale)
  // request resolved AFTER the second, its setEntries/setTotalPages calls
  // would silently overwrite the correct, more-recent results -- the list on
  // screen would stop matching whichever filter chip was actually active,
  // with no error or visual indication anything was wrong. Each call to
  // load() claims the next id; a response only gets applied if it's still
  // the most recently issued request by the time it resolves.
  const requestIdRef = useRef(0);

  const load = useCallback(async (targetPage, mood, tag, keepsake) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(targetPage), limit: "12" });
      if (mood) params.set("mood", mood);
      if (tag) params.set("tag", tag);
      if (keepsake) params.set("keepsake", "true");
      const data = await apiFetch(`/api/journal/entries?${params.toString()}`);
      if (requestId !== requestIdRef.current) return; // superseded by a newer request
      setEntries(data.entries || []);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(describeError(err));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  async function runSearch(e) {
    e?.preventDefault();
    // Same re-entrancy guard as everywhere else this session (JournalPage's
    // save(), ChatPage's sendMessage) -- the Search button is disabled while
    // searchBusy, but that only takes effect after React commits the
    // re-render, so a fast repeated Enter in the search box can still fire
    // two overlapping GET /api/journal/search requests for what was meant to
    // be one search.
    if (searchBusy) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchActive(false);
      setSearchResults([]);
      setSearchMode("empty_query");
      return;
    }
    setSearchActive(true);
    setSearchBusy(true);
    setSearchError("");
    try {
      const data = await apiFetch(`/api/journal/search?q=${encodeURIComponent(q)}`);
      setSearchResults(data.results || []);
      setSearchMode(data.mode);
    } catch (err) {
      setSearchError(describeError(err));
    } finally {
      setSearchBusy(false);
    }
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchActive(false);
    setSearchResults([]);
    setSearchMode("empty_query");
    setSearchError("");
  }

  async function commitTagRename(from, to) {
    // Same re-entrancy guard as runSearch above -- the inline editor's Save/
    // Delete buttons disable while renameBusy, but a fast repeated Enter on
    // the rename form can still fire two overlapping PATCH
    // /api/journal/tags/rename requests before that disabled state commits.
    if (renameBusy) return;
    setRenameBusy(true);
    setRenameError("");
    try {
      await apiFetch("/api/journal/tags/rename", {
        method: "PATCH",
        body: JSON.stringify({ from, to }),
      });
      const filterWasCleared = tagFilter === from;
      const [tagsData] = await Promise.all([
        apiFetch("/api/journal/tags"),
        load(filterWasCleared ? 1 : page, moodFilter, filterWasCleared ? "" : tagFilter, keepsakeOnly),
      ]);
      setAvailableTags(tagsData.tags || []);
      // The active filter chip was pointing at the tag that just got
      // renamed/removed -- clear it (renaming into `to` isn't automatically
      // re-applied as the filter; that'd be a surprising side effect of what
      // was framed as a cleanup action, not a filter change).
      if (filterWasCleared) setTagFilter("");
      setEditingTag(null);
      setRenameValue("");
    } catch (err) {
      setRenameError(describeError(err));
    } finally {
      setRenameBusy(false);
    }
  }

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
    load(1, moodFilter, tagFilter, keepsakeOnly);
    // Filter changes reset back to page 1 -- staying on e.g. page 3 of an
    // unfiltered list while switching to a mood with only 2 matching entries
    // would just show an empty page for no visible reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moodFilter, tagFilter, keepsakeOnly]);

  const rankedTags = useMemo(
    () => [...availableTags].sort((a, b) => b.count - a.count),
    [availableTags],
  );
  const visibleTags = showAllTags ? rankedTags : rankedTags.slice(0, VISIBLE_TAG_COUNT);
  const hiddenTagCount = rankedTags.length - visibleTags.length;
  const activeFilterCount = (moodFilter ? 1 : 0) + (tagFilter ? 1 : 0) + (keepsakeOnly ? 1 : 0);

  return (
    <>
      <motion.div variants={cVariants} initial="hidden" animate="visible" className="max-w-4xl mx-auto space-y-4">
        <motion.div variants={iVariants} className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="ui-kicker">Your journal</p>
            <h2 className="ui-title flex items-center gap-2">
              <BookOpen size={22} />
              All entries
            </h2>
            <p className="text-sm text-ink/60 mt-1">
              {total > 0 ? `${total} ${total === 1 ? "entry" : "entries"}` : "No entries yet."}
            </p>
          </div>

          {/* Single filter trigger instead of a permanently-open mood row +
              tag cloud. Badge shows how many filters are active so state is
              still visible even while collapsed. */}
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm transition ${
              showFilters || activeFilterCount > 0
                ? "border-signal/50 bg-signal/15 text-ink"
                : "border-ink/12 bg-ink/5 text-ink/70 hover:bg-ink/10"
            }`}
          >
            <SlidersHorizontal size={15} />
            Filter
            {activeFilterCount > 0 && (
              <span className="ui-mono text-[10px] leading-none px-1.5 py-1 rounded-full bg-signal text-ink">
                {activeFilterCount}
              </span>
            )}
          </button>
        </motion.div>

        {/* Search by meaning, not exact words -- same GET /api/journal/search
            this app already uses on the Write page's sidebar, now also
            reachable from the actual archive it's meant to search. Search
            and the mood/tag filter below are deliberately separate modes
            (not combinable into one query) -- while a search is active it
            replaces the filtered/paginated list entirely. */}
        <motion.form variants={iVariants} onSubmit={runSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
            <input
              className="ui-input w-full pl-9 pr-9"
              placeholder="Search by meaning -- e.g. &quot;struggling to focus at work&quot;"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink/70"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <button type="submit" className="px-4 min-h-11 ui-button-primary shrink-0" disabled={searchBusy}>
            {searchBusy ? "…" : "Search"}
          </button>
        </motion.form>

        {searchActive ? (
          <>
            {searchError && <p role="alert" className="text-sm text-red-300">{searchError}</p>}
            {!searchError && searchMode === "unavailable" && (
              <p className="text-xs text-ink/50">
                Semantic search isn't set up for your entries yet -- run the embedding backfill on the server
                (`npm run embed-journals`).
              </p>
            )}
            {!searchError && searchMode === "no_match" && (
              <p className="text-xs text-ink/50">No closely related entries found for that.</p>
            )}
            {searchResults.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setOpenSearchEntryId(r.id)}
                    className="ui-card rounded-2xl p-4 text-left hover:bg-ink/10 transition space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-ink/50 ui-mono">{new Date(r.createdAt).toLocaleDateString()}</span>
                      <span className="text-[10px] text-ink/55">{Math.round(r.score * 100)}% match</span>
                    </div>
                    <p className="font-medium text-sm">{r.title || truncateAtWord(r.excerpt, 90)}</p>
                    {r.title && <p className="text-sm text-ink/70">{truncateAtWord(r.excerpt, 160)}</p>}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
        <>
        {/* Active filters stay visible as removable chips even when the
            filter panel itself is collapsed, so "why is my list short" is
            always answerable at a glance. */}
        {!showFilters && activeFilterCount > 0 && (
          <div className="flex items-center gap-2 flex-wrap -mt-2">
            {keepsakeOnly && (
              <button
                type="button"
                onClick={() => setKeepsakeOnly(false)}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full border border-ink/15 bg-ink/5 text-xs hover:bg-ink/10"
              >
                <Gem size={11} />
                Keepsakes
                <X size={12} className="text-ink/50" />
              </button>
            )}
            {moodFilter && (
              <button
                type="button"
                onClick={() => setMoodFilter("")}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full border border-ink/15 bg-ink/5 text-xs capitalize hover:bg-ink/10"
              >
                <span className="h-2 w-2 rounded-full" style={moodDotStyle(moodFilter)} />
                {MOOD_LABELS[moodFilter] || moodFilter}
                <X size={12} className="text-ink/50" />
              </button>
            )}
            {tagFilter && (
              <button
                type="button"
                onClick={() => setTagFilter("")}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full border border-ink/15 bg-ink/5 text-xs hover:bg-ink/10"
              >
                {tagFilter}
                <X size={12} className="text-ink/50" />
              </button>
            )}
          </div>
        )}

        <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reducedMotion ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
          <div className="ui-card rounded-2xl p-4 space-y-4">
            <div>
              <p className="ui-kicker mb-2">Mood</p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setMoodFilter("")}
                  className={`px-3 py-1.5 rounded-lg border text-xs capitalize ${
                    moodFilter === "" ? "border-ink/40 bg-ink/10" : "border-ink/10 bg-ink/5 hover:bg-ink/10"
                  }`}
                >
                  All moods
                </button>
                {moods.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMoodFilter(moodFilter === m ? "" : m)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs capitalize ${
                      moodFilter === m ? "border-ink/40 bg-ink/10" : "border-ink/10 bg-ink/5 hover:bg-ink/10"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={moodDotStyle(m)} />
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Keepsakes-only toggle -- a single chip, not a whole labeled
                section like Mood/Tags, since it's one binary switch rather
                than a set of mutually exclusive options. */}
            <div>
              <button
                type="button"
                onClick={() => setKeepsakeOnly((s) => !s)}
                aria-pressed={keepsakeOnly}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs ${
                  keepsakeOnly ? "border-signal/50 bg-signal/15 text-ink" : "border-ink/10 bg-ink/5 text-ink/70 hover:bg-ink/10"
                }`}
              >
                <Gem size={13} />
                Keepsakes only
              </button>
            </div>

            {/* Tag filter -- previously the only way to narrow the archive
                was by mood; tags (the words the user actually types
                themselves, e.g. "work", "family") had no filter at all.
                Ranked by frequency, capped at VISIBLE_TAG_COUNT with an
                expand toggle, and counts get their own muted badge instead
                of sitting as plain text next to the label. */}
            {rankedTags.length > 0 && (
              <div>
                <p className="ui-kicker mb-2">Tags</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setTagFilter("")}
                    className={`px-2.5 py-1 rounded-lg border text-xs ${
                      tagFilter === "" ? "border-ink/40 bg-ink/10" : "border-ink/10 bg-ink/5 hover:bg-ink/10"
                    }`}
                  >
                    All
                  </button>
                  {visibleTags.map(({ tag, count }) =>
                    editingTag === tag ? (
                      // Inline editor replaces the chip itself rather than
                      // opening a separate modal -- this is meant to feel
                      // like an occasional, lightweight cleanup action, not a
                      // whole new surface. Enter saves, Escape cancels, same
                      // convention as every other inline-edit text field in
                      // the app.
                      <form
                        key={tag}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const next = renameValue.trim();
                          if (!next || next.toLowerCase() === tag.toLowerCase()) {
                            setEditingTag(null);
                            return;
                          }
                          commitTagRename(tag, next);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-signal/40 bg-signal/10 pl-2 pr-1 py-1"
                      >
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditingTag(null);
                          }}
                          disabled={renameBusy}
                          className="w-24 bg-transparent text-xs outline-none focus:ring-2 focus:ring-signal/50 rounded disabled:opacity-60"
                        />
                        <button
                          type="submit"
                          disabled={renameBusy}
                          aria-label="Save tag name"
                          className="p-1 rounded hover:bg-ink/10 text-ink/70 hover:text-ink disabled:opacity-50"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          type="button"
                          disabled={renameBusy}
                          onClick={() => {
                            if (window.confirm(`Remove the "${tag}" tag from every entry? This can't be undone.`)) {
                              commitTagRename(tag, "");
                            }
                          }}
                          aria-label="Delete tag"
                          className="p-1 rounded hover:bg-red-500/10 text-ink/70 hover:text-red-300 disabled:opacity-50"
                        >
                          <Trash2 size={12} />
                        </button>
                        <button
                          type="button"
                          disabled={renameBusy}
                          onClick={() => setEditingTag(null)}
                          aria-label="Cancel"
                          className="p-1 rounded hover:bg-ink/10 text-ink/70 hover:text-ink disabled:opacity-50"
                        >
                          <X size={12} />
                        </button>
                      </form>
                    ) : (
                      <span
                        key={tag}
                        className={`group inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg border text-xs ${
                          tagFilter === tag ? "border-ink/40 bg-ink/10" : "border-ink/10 bg-ink/5 hover:bg-ink/10"
                        }`}
                      >
                        <button type="button" onClick={() => setTagFilter(tagFilter === tag ? "" : tag)} className="inline-flex items-center gap-1.5">
                          {tag}
                          <span className="ui-mono text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-ink/10 text-ink/50">
                            {count}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTag(tag);
                            setRenameValue(tag);
                            setRenameError("");
                          }}
                          aria-label={`Rename tag "${tag}"`}
                          title="Rename or remove this tag"
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-ink/10 text-ink/50 hover:text-ink transition"
                        >
                          <Pencil size={11} />
                        </button>
                      </span>
                    ),
                  )}
                  {hiddenTagCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllTags(true)}
                      className="px-2.5 py-1 rounded-lg border border-dashed border-ink/15 text-xs text-ink/55 hover:bg-ink/5"
                    >
                      +{hiddenTagCount} more
                    </button>
                  )}
                  {showAllTags && rankedTags.length > VISIBLE_TAG_COUNT && (
                    <button
                      type="button"
                      onClick={() => setShowAllTags(false)}
                      className="px-2.5 py-1 rounded-lg border border-dashed border-ink/15 text-xs text-ink/55 hover:bg-ink/5"
                    >
                      Show less
                    </button>
                  )}
                </div>
                {renameError && <p role="alert" className="text-xs text-red-300 mt-2">{renameError}</p>}
              </div>
            )}
          </div>
          </motion.div>
        )}
        </AnimatePresence>

        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

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
          <div className="ui-card rounded-2xl p-6 text-center text-ink/60 text-sm">
            {moodFilter || tagFilter || keepsakeOnly
              ? `No entries match ${[keepsakeOnly && "Keepsakes only", moodFilter && `mood "${moodFilter}"`, tagFilter && `tag "${tagFilter}"`].filter(Boolean).join(" and ")}.`
              : "Nothing here yet -- write your first entry to start building your archive."}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {entries.map((entry, i) => (
              <motion.button
                key={entry._id}
                type="button"
                onClick={() => setOpenEntry(entry)}
                initial={reducedMotion ? undefined : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.03, ease: [0.16, 1, 0.3, 1] }}
                className="ui-card rounded-2xl p-4 text-left hover:bg-ink/10 transition space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink/60 capitalize">
                    <span className="h-2 w-2 rounded-full shrink-0" style={moodDotStyle(entry.mood)} />
                    {entry.mood}
                  </span>
                  <span className="text-xs text-ink/50 ui-mono">
                    {new Date(entry.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <p className="font-medium text-sm">{entry.title || "Untitled entry"}</p>
                <p className="text-sm text-ink/70">{truncateAtWord(entry.content, 160)}</p>
                {entry.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {entry.tags.map((t) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-ink/10 text-ink/60 ui-mono">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </motion.button>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => load(page - 1, moodFilter, tagFilter, keepsakeOnly)}
              className="p-2 rounded-lg border border-ink/15 bg-ink/5 hover:bg-ink/10 disabled:opacity-30 disabled:hover:bg-ink/5"
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-ink/60">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => load(page + 1, moodFilter, tagFilter, keepsakeOnly)}
              className="p-2 rounded-lg border border-ink/15 bg-ink/5 hover:bg-ink/10 disabled:opacity-30 disabled:hover:bg-ink/5"
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        </>
        )}
      </motion.div>

      {openEntry && (
        <EntryModal
          entry={openEntry}
          onClose={() => setOpenEntry(null)}
          onUpdated={(updated) => {
            setOpenEntry(updated);
            setEntries((prev) => prev.map((e) => (e._id === updated._id ? { ...e, ...updated } : e)));
          }}
          onDeleted={(id) => {
            setEntries((prev) => prev.filter((e) => e._id !== id));
            setTotal((t) => Math.max(0, t - 1));
          }}
        />
      )}

      {openSearchEntryId && (
        <EntryModalById
          entryId={openSearchEntryId}
          apiFetch={apiFetch}
          onClose={() => setOpenSearchEntryId(null)}
          onDeleted={() => {
            setOpenSearchEntryId(null);
            setSearchResults((prev) => prev.filter((r) => r.id !== openSearchEntryId));
          }}
        />
      )}
    </>
  );
}
