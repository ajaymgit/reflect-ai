import { Router } from "express";
import HealthData from "../../models/HealthData.js";
import JournalEntry from "../../models/JournalEntry.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";

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

function getStreakDays(journals = []) {
  if (!journals.length) return 0;
  const uniqueDays = new Set(
    journals.map((entry) => {
      const date = new Date(entry.createdAt);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }),
  );

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (true) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (!uniqueDays.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
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
    const [latestJournal, allRecentJournals, rangeJournals, healthRows] = await Promise.all([
      JournalEntry.findOne({ userId: req.user._id }).sort({ createdAt: -1 }),
      JournalEntry.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(60),
      JournalEntry.find({ userId: req.user._id, createdAt: { $gte: rangeStart } }).sort({ createdAt: -1 }).limit(30),
      HealthData.find({ userId: req.user._id, date: { $gte: rangeStart } }).sort({ date: -1 }).limit(30),
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

    res.json({
      greeting: `Welcome back, ${req.user.name}`,
      dailyWellnessScore: wellness,
      journalingStreak: streak,
      entriesInRange: rangeJournals.length,
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
        mood: j.mood,
        createdAt: j.createdAt,
      })),
      retrospectAlert:
        streak >= 5
          ? "You have enough recent entries for a strong reflect session."
          : "Add a few more entries to unlock deeper retrospective insights.",
    });
  }),
);

// Backs the Dashboard mood-calendar heatmap (a GitHub-contributions-style
// grid of the last ~18 weeks, color-coded by that day's mood) and the memory
// globe. Only returns days that actually have an entry -- the client renders
// every other day as an empty cell, so a sparse journaling history doesn't
// get papered over with a fabricated mood.
router.get(
  "/mood-calendar",
  requireAuth,
  asyncHandler(async (req, res) => {
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 126));
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const entries = await JournalEntry.find({ userId: req.user._id, createdAt: { $gte: start } })
      .sort({ createdAt: 1 })
      .select("mood title themes createdAt");

    // Most recent entry per calendar day wins, matching the same
    // most-recent-entry convention used for "todaysMood" above. title/themes
    // ride along too -- the memory globe uses them so each pearl represents
    // an actual entry (real title, real extracted keywords) instead of just
    // a colored dot with no connection back to what was written.
    const byDay = new Map();
    const themeCounts = new Map();
    for (const entry of entries) {
      const d = new Date(entry.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      byDay.set(key, {
        mood: entry.mood,
        title: entry.title || "",
        themes: entry.themes || [],
      });
      for (const theme of entry.themes || []) {
        themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
      }
    }

    // The single most-recurring keyword across this window -- used to pick
    // out which memories the globe treats as "core" (glowing, trailed,
    // constellation-linked) so that grouping means something ("these entries
    // are about the same thing") instead of an arbitrary pick.
    let topTheme = null;
    let topThemeCount = 0;
    for (const [theme, count] of themeCounts) {
      if (count > topThemeCount && count >= 2) {
        topTheme = theme;
        topThemeCount = count;
      }
    }

    res.json({
      days: Array.from(byDay.entries()).map(([date, info]) => ({ date, ...info })),
      topTheme,
    });
  }),
);

export default router;
