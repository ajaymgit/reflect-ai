import { Router } from "express";
import mongoose from "mongoose";
import JournalEntry from "../../models/JournalEntry.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { validateRequest } from "../../shared/middleware/validateRequest.js";
import { quickJournalSchema, updateJournalSchema } from "../../shared/validators/chatSchemas.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { extractThemes } from "../../shared/utils/extractThemes.js";
import { embedJournalEntry, findSemanticMatches } from "../../shared/services/embeddings.js";
import { logError } from "../../shared/utils/logger.js";

const router = Router();

// Excludes time-capsule entries whose reveal date hasn't arrived yet (see
// JournalEntry.revealAt) from every normal listing/search/lookup query in
// this file -- a capsule set for a future date shouldn't show up in Recent
// Entries, the archive, search, On This Day, or the theme cloud before then,
// or the whole point of it is gone. `$not: { $gt: now }` matches a normal
// entry (revealAt null/undefined) AND a capsule whose date has already
// passed; only a revealAt strictly in the future is excluded. Used as the
// base filter (merged with whatever else a given query already needs)
// everywhere in this file that lists or looks up entries, so a new capsule
// can never accidentally leak through a query that forgot the guard.
function visibleFilter(extra = {}) {
  return { ...extra, revealAt: { $not: { $gt: new Date() } } };
}

function truncateAtWord(text, maxLen) {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const clean = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${clean}…`;
}

// Meaning-based recall over a user's own journal entries -- e.g. "what did I
// say about my thesis advisor" can surface an entry that never uses those
// exact words, unlike a plain text-contains search. Returns an empty result
// (not an error) with mode:"unavailable" when no entries have an embedding
// yet (see scripts/embedJournalEntries.js) or Ollama's embedding model isn't
// reachable/pulled, so the client can show an honest "not ready yet" state
// instead of "no results" for what could be a great match.
router.get(
  "/search",
  requireAuth,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json({ mode: "empty_query", results: [] });

    const journals = await JournalEntry.find(visibleFilter({ userId: req.user._id }))
      .select("+embedding content mood title createdAt")
      .limit(200);
    const hasAnyEmbeddings = journals.some((j) => Array.isArray(j.embedding));
    const matches = await findSemanticMatches(journals, q, { limit: 8 });

    res.json({
      mode: matches.length ? "semantic" : hasAnyEmbeddings ? "no_match" : "unavailable",
      results: matches.map(({ journal, score }) => ({
        id: journal._id,
        title: journal.title || "",
        excerpt: truncateAtWord(journal.content, 160),
        mood: journal.mood,
        createdAt: journal.createdAt,
        score: Number(score.toFixed(3)),
      })),
    });
  }),
);

router.get(
  "/recent",
  requireAuth,
  asyncHandler(async (req, res) => {
    const entries = await JournalEntry.find(visibleFilter({ userId: req.user._id }))
      .sort({ createdAt: -1 })
      .limit(30)
      .select("_id content mood title tags isKeepsake createdAt");
    res.json({ entries });
  }),
);

// Backs the actual "browse and read my past entries" archive page --
// previously the only ways to see an old entry anywhere in the app were a
// title-only Dashboard card, a 3-line-clamped calendar-day preview, or
// /recent's unpaginated last-30 window with no client page that rendered it
// as a real list. This is real pagination (not just a bigger limit) since a
// long-running journal can have hundreds of entries, and returns full
// `content` per entry (unlike /search's excerpt-only results) so a client
// can open one and read the whole thing.
router.get(
  "/entries",
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const filter = visibleFilter({ userId: req.user._id });
    if (req.query.mood) filter.mood = req.query.mood;
    const tagFilter = req.query.tag ? String(req.query.tag).trim().toLowerCase() : null;

    // Mood is a plain unencrypted enum field, so it filters at the DB level
    // (fast, and pagination happens in the query itself). Tags are stored as
    // one encrypted JSON blob per entry (see models/JournalEntry.js) -- Mongo
    // has no way to match inside that ciphertext, so a tag filter has to
    // decrypt-then-filter in the app instead. Fine at this app's scale (a
    // single user's journal), not something that would hold up at real
    // multi-tenant volume.
    if (!tagFilter) {
      const [entries, total] = await Promise.all([
        JournalEntry.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .select("_id content mood title tags isKeepsake createdAt"),
        JournalEntry.countDocuments(filter),
      ]);
      return res.json({ entries, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
    }

    const all = await JournalEntry.find(filter)
      .sort({ createdAt: -1 })
      .select("_id content mood title tags isKeepsake createdAt");
    const matched = all.filter((e) => (e.tags || []).some((t) => String(t).trim().toLowerCase() === tagFilter));
    const total = matched.length;
    const start = (page - 1) * limit;
    res.json({
      entries: matched.slice(start, start + limit),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

// Powers the tag filter chips on the journal archive page -- previously the
// only filter available was mood; tags (which the user actually writes
// themselves, e.g. "work", "family") had no way to browse by at all. Counts
// let the client show the most-used tags first instead of an arbitrary
// order.
router.get(
  "/tags",
  requireAuth,
  asyncHandler(async (req, res) => {
    const entries = await JournalEntry.find(visibleFilter({ userId: req.user._id })).select("tags");
    const counts = new Map();
    for (const entry of entries) {
      for (const rawTag of entry.tags || []) {
        const tag = String(rawTag).trim().toLowerCase();
        if (!tag) continue;
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const tags = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count }));
    res.json({ tags });
  }),
);

// Backs the Write page's theme cloud (client/src/pages/JournalPage.jsx) --
// word-frequency counts across every extracted theme (see
// shared/utils/extractThemes.js, run automatically on every saved entry)
// from this user's ENTIRE history, not just recent entries. Deliberately a
// different data source than Retrospect's `recurringThemes` (which is
// scoped to the last 20 entries, for "what's going on lately") -- this is
// "what you tend to write about, period," meant as writing fuel while
// composing a new entry, not a duplicate of the same recency-scoped list.
router.get(
  "/theme-cloud",
  requireAuth,
  asyncHandler(async (req, res) => {
    const entries = await JournalEntry.find(visibleFilter({ userId: req.user._id })).select("themes");
    const counts = new Map();
    for (const entry of entries) {
      for (const rawTheme of entry.themes || []) {
        const theme = String(rawTheme).trim().toLowerCase();
        if (!theme) continue;
        counts.set(theme, (counts.get(theme) || 0) + 1);
      }
    }
    const themes = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 24)
      .map(([theme, count]) => ({ theme, count }));
    res.json({ themes });
  }),
);

// Backs the Dashboard mood-calendar heatmap and the Health/Retrospect chart
// "click a day to see what you wrote" drill-down -- both need to look up
// whatever journal entry exists for one specific calendar day. If someone
// wrote more than once that day, the most recent entry wins (same
// most-recent-entry convention /dashboard/summary already uses for
// "todaysMood").
router.get(
  "/by-date",
  requireAuth,
  asyncHandler(async (req, res) => {
    const raw = String(req.query.date || "");
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      return res.json({ entry: null });
    }
    const dayStart = new Date(parsed);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const entry = await JournalEntry.findOne(
      visibleFilter({
        userId: req.user._id,
        createdAt: { $gte: dayStart, $lt: dayEnd },
      }),
    )
      .sort({ createdAt: -1 })
      .select("_id content mood title tags isKeepsake createdAt");
    res.json({ entry });
  }),
);

// "On This Day" -- entries written on today's month/day in any past year.
// This is Day One's single most-cited feature for a reason: it's real
// perspective on your own life with zero setup, backed by data the app
// already has, not a generated "insight." Deliberately NOT month/day-fuzzy
// (no "within a few days") -- the exact-date anchor is what makes it feel
// like a genuine coincidence worth noticing rather than an arbitrary nearby
// entry. Fetches this user's full history rather than a capped window (same
// "fine at this app's single-user scale" tradeoff already made by /entries'
// tag filter) since there's no way to know in advance which years might
// have a match.
router.get(
  "/on-this-day",
  requireAuth,
  asyncHandler(async (req, res) => {
    const now = new Date();
    const month = now.getMonth();
    const day = now.getDate();
    const currentYear = now.getFullYear();

    const entries = await JournalEntry.find(visibleFilter({ userId: req.user._id }))
      .select("_id content mood title tags isKeepsake createdAt")
      .sort({ createdAt: -1 });

    const matches = entries
      .filter((e) => {
        const d = new Date(e.createdAt);
        return d.getMonth() === month && d.getDate() === day && d.getFullYear() !== currentYear;
      })
      .map((e) => ({
        _id: e._id,
        title: e.title,
        content: e.content,
        mood: e.mood,
        tags: e.tags,
        isKeepsake: e.isKeepsake,
        createdAt: e.createdAt,
        yearsAgo: currentYear - new Date(e.createdAt).getFullYear(),
      }))
      .sort((a, b) => a.yearsAgo - b.yearsAgo);

    res.json({ entries: matches });
  }),
);

// Time capsules -- letters to a future version of yourself (see
// JournalEntry.revealAt). Split into two lists: `waiting` capsules only ever
// expose mood/createdAt/revealAt -- never title or content, since the whole
// point is that even the sender can't peek early through this endpoint --
// and `ready` capsules (revealAt has passed) get the real entry, same as
// any other now-visible entry. Ordered soonest-to-open first within each
// list, since "how much longer" is the actual question someone has about a
// waiting capsule.
router.get(
  "/capsules",
  requireAuth,
  asyncHandler(async (req, res) => {
    const now = new Date();
    const entries = await JournalEntry.find({ userId: req.user._id, revealAt: { $ne: null } })
      .select("_id content mood title tags isKeepsake createdAt revealAt")
      .sort({ revealAt: 1 });

    const waiting = [];
    const ready = [];
    for (const e of entries) {
      if (new Date(e.revealAt) > now) {
        waiting.push({ _id: e._id, mood: e.mood, createdAt: e.createdAt, revealAt: e.revealAt });
      } else {
        ready.push({
          _id: e._id,
          title: e.title,
          content: e.content,
          mood: e.mood,
          tags: e.tags,
          isKeepsake: e.isKeepsake,
          createdAt: e.createdAt,
          revealAt: e.revealAt,
        });
      }
    }
    res.json({ waiting, ready });
  }),
);

// Single full-entry lookup by id -- backs Dashboard's "click a recent entry
// to read it" modal (see client/src/components/EntryModal.jsx), which only
// ever has the 110-character excerpt from /dashboard/summary until it needs
// the real thing. Registered after every literal GET route above (/search,
// /recent, /entries, /tags, /by-date, /on-this-day, /capsules) -- Express
// matches routes in registration order, and a param route like "/:id"
// placed earlier would shadow those literal paths (a request to /search
// would match here first, with id="search").
router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ code: "INVALID_ID", message: "Not a valid entry id." });
    }
    // Scoped to req.user._id in the query itself (not checked after the
    // fact) so one user can never fetch another user's entry by guessing or
    // incrementing an id -- a mismatched id/userId pair just looks identical
    // to a nonexistent entry.
    const entry = await JournalEntry.findOne(
      visibleFilter({ _id: req.params.id, userId: req.user._id }),
    ).select("_id content mood title tags isKeepsake createdAt");
    if (!entry) return res.status(404).json({ code: "NOT_FOUND", message: "Entry not found." });
    res.json({ entry });
  }),
);

// Editing an already-saved entry -- previously there was no way to fix a
// typo, correct a misjudged mood, or retag an entry after the fact anywhere
// in the app; content str could only ever be created, never changed. Scoped
// to the caller's own entry via the query itself (same pattern as GET /:id
// above), so a mismatched id/userId pair looks identical to a nonexistent
// entry rather than leaking whether some other user's id exists.
router.patch(
  "/:id",
  requireAuth,
  validateRequest(updateJournalSchema),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ code: "INVALID_ID", message: "Not a valid entry id." });
    }
    const entry = await JournalEntry.findOne({ _id: req.params.id, userId: req.user._id });
    if (!entry) return res.status(404).json({ code: "NOT_FOUND", message: "Entry not found." });

    const { content, mood, title, tags, isKeepsake } = req.validated.body;

    // themes/embedding only get recomputed when content actually changed --
    // both are pure derivatives of it (see extractThemes/embedJournalEntry),
    // so re-running them on a request that only touched e.g. mood would be
    // wasted work (and, for the embedding call, a pointless network round
    // trip to Ollama/the embedding provider).
    let contentChanged = false;
    if (content !== undefined) {
      const trimmed = content.trim();
      if (trimmed !== entry.content) {
        entry.content = trimmed;
        entry.themes = extractThemes(trimmed);
        contentChanged = true;
      }
    }
    if (title !== undefined) entry.title = title;
    if (mood !== undefined) entry.mood = mood;
    if (tags !== undefined) entry.tags = tags;
    if (isKeepsake !== undefined) entry.isKeepsake = isKeepsake;

    await entry.save();

    if (contentChanged) {
      // Fire-and-forget, same as quick-entry's create path below -- the
      // response above already reflects the saved edit, so a slow/
      // unavailable embedding call never adds latency to editing or blocks
      // it on a feature that's a pure enhancement.
      embedJournalEntry(entry).catch((error) => {
        logError("Failed to re-embed edited journal entry", {
          entryId: String(entry._id),
          error: error?.message || String(error),
        });
      });
    }

    res.json({ entry });
  }),
);

// Scoped to the caller's own entry the same way every other id-based route
// in this file is -- findOneAndDelete's filter (not a separate
// find-then-check-ownership-then-delete) means there's no window where an
// existence check and the delete itself could disagree about which entry is
// being touched.
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ code: "INVALID_ID", message: "Not a valid entry id." });
    }
    const entry = await JournalEntry.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!entry) return res.status(404).json({ code: "NOT_FOUND", message: "Entry not found." });
    res.json({ ok: true });
  }),
);

router.post(
  "/quick-entry",
  requireAuth,
  validateRequest(quickJournalSchema),
  asyncHandler(async (req, res) => {
    // Previously this route never set `themes` at all, so recurringThemes on
    // the Retrospect page could never be non-empty for any entry created
    // through the real app (only server/src/seed.js's demo data ever
    // populated it). This computes real, deterministic keywords from the
    // entry's own content -- no AI call, no new dependency.
    //
    // revealAt is re-validated here, not just trusted from the client's own
    // "must be a future date" input constraint -- only actually stored if
    // it's still strictly in the future by the time this request lands,
    // otherwise this would just be a normal entry (a "time capsule" set for
    // the past makes no sense).
    const revealAt =
      req.validated.body.revealAt && new Date(req.validated.body.revealAt) > new Date()
        ? new Date(req.validated.body.revealAt)
        : null;
    const entry = await JournalEntry.create({
      userId: req.user._id,
      content: req.validated.body.content,
      mood: req.validated.body.mood,
      title: req.validated.body.title || "",
      tags: req.validated.body.tags || [],
      themes: extractThemes(req.validated.body.content),
      isKeepsake: req.validated.body.isKeepsake === true,
      revealAt,
    });
    // Fire-and-forget: the entry is already saved and responded with above,
    // so a slow/unavailable Ollama embedding call never adds latency to
    // journal saving or blocks it on a feature that's a pure enhancement.
    embedJournalEntry(entry).catch((error) => {
      logError("Failed to embed new journal entry", {
        entryId: String(entry._id),
        error: error?.message || String(error),
      });
    });
    res.status(201).json(entry);
  }),
);

// Backfill route, scoped to the caller's own entries only. extractThemes's
// STOPWORDS list has grown since entries in this account were first written
// (it was missing common filler words like "actually"/"instead"/"like",
// which then won the per-entry top-3 over real topics), and `themes` is only
// ever computed once at write time -- older entries keep serving whatever
// extractThemes said back then until something recomputes them. Idempotent
// and safe to call repeatedly; only touches entries whose recomputed value
// actually differs from what's stored.
router.post(
  "/recompute-themes",
  requireAuth,
  asyncHandler(async (req, res) => {
    const entries = await JournalEntry.find({ userId: req.user._id });
    let changed = 0;
    for (const entry of entries) {
      const next = extractThemes(entry.content);
      const prev = Array.isArray(entry.themes) ? entry.themes : [];
      const same = prev.length === next.length && prev.every((t, i) => t === next[i]);
      if (!same) {
        entry.themes = next;
        await entry.save();
        changed += 1;
      }
    }
    res.json({ scanned: entries.length, changed });
  }),
);

export default router;

