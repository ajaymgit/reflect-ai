import { Router } from "express";
import HealthData from "../../models/HealthData.js";
import JournalEntry from "../../models/JournalEntry.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { getStreakDays } from "../../shared/utils/streak.js";

const router = Router();

function getRangeStart(range) {
  const now = new Date();
  const start = new Date(now);

  if (range === "today") {
    start.setHours(0, 0, 0, 0);
    return start;
  }

  if (range === "month") {
    start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  start.setDate(now.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return start;
}

function buildCumulativeInsight({ mood, avgStress, avgSleep, avgSteps }) {
  if (!mood || mood === "No check-in yet") {
    return "Add a quick journal check-in today to unlock a stronger combined mood and health insight.";
  }

  const stressTone = avgStress >= 65 ? "higher stress load" : avgStress >= 45 ? "moderate stress load" : "stable stress";
  const sleepTone = avgSleep >= 7 ? "rest quality is supportive" : "sleep looks slightly low";
  const movementTone = avgSteps >= 7000 ? "movement is helping your balance" : "more movement could improve your energy";
  return `You are currently feeling ${mood}. Your recent pattern shows ${stressTone}, ${sleepTone}, and ${movementTone}.`;
}

// Previously untitled entries just used content.slice(0, 42) verbatim as the
// display title -- a hard character cut with no regard for word boundaries
// and no ellipsis, so titles routinely ended mid-word ("...felt sc") and
// looked broken rather than intentionally shortened. This backs off to the
// last whole word within the limit and appends an ellipsis whenever it
// actually cut something off.
function truncateAtWord(text, maxLen) {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const clean = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${clean}…`;
}

function buildEmotionDistribution(journals = []) {
  const base = {
    happy: 0,
    calm: 0,
    reflective: 0,
    sad: 0,
    stressed: 0,
    angry: 0,
  };
  for (const entry of journals) {
    if (base[entry.mood] !== undefined) {
      base[entry.mood] += 1;
    }
  }
  return base;
}

const ALLOWED_RANGES = new Set(["today", "week", "month"]);

// Same "35-95, null with zero data" wellness formula the /summary handler
// below already uses for the single current score -- factored out so the
// 14-day trend line can compute the identical number for each individual
// day instead of drifting out of sync with a slightly different formula.
function wellnessFromStress(stressScore) {
  if (!Number.isFinite(stressScore)) return null;
  return Math.max(35, Math.min(95, 100 - Math.round(stressScore * 0.6)));
}

// Same guard as journal/routes.js's visibleFilter -- excludes time-capsule
// entries (JournalEntry.revealAt in the future) from Dashboard's own
// journal queries, so a capsule can't leak through as "today's mood," a
// recent entry, or a mood-calendar day before its reveal date.
function visibleFilter(extra = {}) {
  return { ...extra, revealAt: { $not: { $gt: new Date() } } };
}

router.get(
  "/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Previously safe only by incidental String() coercion (a raw object like
    // ?range[$ne]=1 would just stringify to "[object Object]" and fall through
    // to the default). Now explicitly restricted to the only three values
    // getRangeStart() actually understands.
    const rawRange = String(req.query.range || "week").toLowerCase();
    const range = ALLOWED_RANGES.has(rawRange) ? rawRange : "week";
    const rangeStart = getRangeStart(range);
    const trendStart = new Date();
    trendStart.setDate(trendStart.getDate() - 13);
    trendStart.setHours(0, 0, 0, 0);
    const [latestJournal, allRecentJournals, rangeJournals, healthRows, trendHealthRows] = await Promise.all([
      JournalEntry.findOne(visibleFilter({ userId: req.user._id })).sort({ createdAt: -1 }),
      JournalEntry.find(visibleFilter({ userId: req.user._id })).sort({ createdAt: -1 }).limit(60),
      JournalEntry.find(visibleFilter({ userId: req.user._id, createdAt: { $gte: rangeStart } }))
        .sort({ createdAt: -1 })
        .limit(30),
      HealthData.find({ userId: req.user._id, date: { $gte: rangeStart } }).sort({ date: -1 }).limit(30),
      // Separate, fixed 14-day window purely for the wellness sparkline --
      // deliberately independent of `range` (which the rest of this endpoint
      // uses and can be as short as "today") so the trend line always shows
      // a real trend instead of collapsing to 0-1 points.
      HealthData.find({ userId: req.user._id, date: { $gte: trendStart } }).sort({ date: 1 }).select("date stressScore"),
    ]);

    const recentJournals = rangeJournals.slice(0, 8);
    const streak = getStreakDays(allRecentJournals);
    const avgStress = healthRows.length
      ? Math.round(healthRows.reduce((sum, item) => sum + (item.stressScore || 0), 0) / healthRows.length)
      : 0;
    const avgSleep = healthRows.length
      ? Number((healthRows.reduce((sum, item) => sum + (item.sleepHours || 0), 0) / healthRows.length).toFixed(1))
      : 0;
    const avgSteps = healthRows.length
      ? Math.round(healthRows.reduce((sum, item) => sum + (item.steps || 0), 0) / healthRows.length)
      : 0;
    // Previously this always computed a score even with zero health rows --
    // avgStress defaults to 0 for an empty array, so a brand-new account with
    // no data at all was shown a 95/100 "wellness score" on the same screen
    // that also says "No check-in yet". null (matching the pattern
    // HealthData's own /overview route already uses for `latest`) lets the
    // client render an honest "not enough data yet" state instead.
    const wellness = healthRows.length ? Math.max(35, Math.min(95, 100 - Math.round(avgStress * 0.6))) : null;

    // One point per day for the last 14 days -- feeds the small trend
    // sparkline under the Dashboard hero's wellness number, giving that
    // headline figure actual context (rising/falling/flat) instead of just
    // sitting there as an isolated number.
    const wellnessByDay = new Map();
    for (const row of trendHealthRows) {
      const d = new Date(row.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      wellnessByDay.set(key, wellnessFromStress(row.stressScore));
    }
    const wellnessTrend = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      wellnessTrend.push({ date: key, score: wellnessByDay.get(key) ?? null });
    }

    res.json({
      greeting: `Welcome back, ${req.user.name}`,
      dailyWellnessScore: wellness,
      wellnessTrend,
      journalingStreak: streak,
      entriesInRange: rangeJournals.length,
      // Recent Entries below is scoped to `range` (this week, by default) --
      // previously its empty state always read "No entries yet -- write
      // your first one above," which is only true for a genuinely new
      // account. Someone with months of history who just hasn't written
      // this week saw the exact same "start from zero" message as a brand
      // new user. `allRecentJournals` (already fetched above, uncapped by
      // range) tells the client which empty state is actually true.
      hasAnyEntries: allRecentJournals.length > 0,
      todaysMood: latestJournal?.mood || "No check-in yet",
      selectedRange: range,
      emotionDistribution: buildEmotionDistribution(allRecentJournals),
      cumulativeInsight: buildCumulativeInsight({
        mood: latestJournal?.mood || "No check-in yet",
        avgStress,
        avgSleep,
        avgSteps,
      }),
      quickHealthSummary: {
        averageSleep: avgSleep,
        averageSteps: avgSteps,
        averageStress: avgStress,
      },
      recentEntries: recentJournals.map((j) => ({
        id: j._id,
        title: j.title || truncateAtWord(j.content, 42),
        excerpt: truncateAtWord(j.content, 110),
        mood: j.mood,
        tags: j.tags || [],
        isKeepsake: j.isKeepsake === true,
        createdAt: j.createdAt,
      })),
      // Was gated on `streak >= 5` (consecutive-day journaling streak) --
      // completely unrelated to whether Retrospect actually has anything to
      // show. A broken streak (missed a day or two) made this say "add a few
      // more entries" even for an account with dozens of entries and a
      // fully-populated Retrospect preview sitting right below it on the
      // same page. Gated on total entry count instead, matching the same
      // MIN_ENTRIES_FOR_AI=3 threshold retrospect/service.js uses to decide
      // whether real analysis is possible -- so this banner agrees with
      // what Retrospect itself is actually able to show.
      retrospectAlert:
        allRecentJournals.length >= 3
          ? "You have enough entries for a strong reflect session."
          : "Add a few more entries to unlock deeper retrospective insights.",
    });
  }),
);

// Backs the Dashboard mood-calendar heatmap (a GitHub-contributions-style
// grid of the last ~18 weeks, color-coded by that day's mood) and the
// Keepsakes globe. Only returns days that actually have an entry -- the
// client renders every other day as an empty cell, so a sparse journaling
// history doesn't get papered over with a fabricated mood.
router.get(
  "/mood-calendar",
  requireAuth,
  asyncHandler(async (req, res) => {
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 126));
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const entries = await JournalEntry.find(visibleFilter({ userId: req.user._id, createdAt: { $gte: start } }))
      .sort({ createdAt: 1 })
      .select("mood title themes isKeepsake createdAt");

    // Most recent entry per calendar day wins, matching the same
    // most-recent-entry convention used for "todaysMood" above. title/themes
    // ride along too -- the Keepsakes globe uses them so each pearl
    // represents an actual entry (real title, real extracted keywords)
    // instead of just a colored dot with no connection back to what was
    // written. isKeepsake rides along too -- previously the globe decided
    // for itself which entries were "core" (today's, or whatever tied to the
    // single most recurring theme); now that's a real per-entry flag someone
    // sets themselves at write-time (see JournalEntry.isKeepsake), so this
    // just passes it through rather than deriving a heuristic here.
    const byDay = new Map();
    for (const entry of entries) {
      const d = new Date(entry.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      byDay.set(key, {
        mood: entry.mood,
        title: entry.title || "",
        themes: entry.themes || [],
        isKeepsake: entry.isKeepsake === true,
      });
    }

    res.json({
      days: Array.from(byDay.entries()).map(([date, info]) => ({ date, ...info })),
    });
  }),
);

export default router;
