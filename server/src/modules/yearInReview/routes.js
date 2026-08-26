import { Router } from "express";
import HealthData from "../../models/HealthData.js";
import JournalEntry from "../../models/JournalEntry.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { computeHealthMoodCorrelations } from "../../shared/utils/correlation.js";
import { visibleJournalFilter } from "../../shared/utils/visibleJournal.js";

const router = Router();

// Same score mapping used by Retrospect's chart/correlation util -- kept as
// a local duplicate (not imported) for the same reason chat/service.js and
// retrospect/service.js duplicate their own Ollama config: this module
// evolves independently of correlation.js's own MOOD_SCORE, and a shared
// mutable import would silently couple them.
const MOOD_SCORE = { happy: 5, calm: 4, reflective: 3, sad: 2, stressed: 1, angry: 0 };

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A "wrapped"-style retrospective built entirely from data this app already
// has (journal entries, health readings) -- no new data collection, no AI
// call required for the core numbers (the one AI-adjacent piece, the health
// correlation highlight, reuses the same real Pearson-correlation util the
// Health/Retrospect pages already use, not a fresh LLM guess). Looks back
// 365 days from today; `hasData:false` lets the client show an honest empty
// state instead of a page full of zeroes for a brand-new account.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const now = new Date();
    const yearAgo = new Date(now);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);

    // visibleJournalFilter excludes time-capsule entries not yet due -- without
    // it, a sealed capsule's content/mood would be folded into this year's
    // aggregate stats (mood counts, word totals, streaks, correlation
    // highlight) and `memberSince` could even resolve to a still-sealed
    // capsule's date, all before its reveal date.
    const [entries, healthRows, firstEverEntry] = await Promise.all([
      JournalEntry.find(visibleJournalFilter({ userId, createdAt: { $gte: yearAgo } })).sort({ createdAt: 1 }),
      HealthData.find({ userId, date: { $gte: yearAgo } }).sort({ date: 1 }),
      JournalEntry.findOne(visibleJournalFilter({ userId })).sort({ createdAt: 1 }).select("createdAt"),
    ]);

    if (entries.length === 0) {
      return res.json({ hasData: false });
    }

    const moodCounts = {};
    let totalWords = 0;
    const themeCounts = new Map();
    const uniqueDays = new Set();
    const monthlyScores = new Map();

    for (const entry of entries) {
      moodCounts[entry.mood] = (moodCounts[entry.mood] || 0) + 1;
      totalWords += String(entry.content || "").trim().split(/\s+/).filter(Boolean).length;
      for (const theme of entry.themes || []) {
        themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
      }
      const key = dayKey(entry.createdAt);
      uniqueDays.add(key);

      const monthKey = key.slice(0, 7);
      const score = MOOD_SCORE[entry.mood] ?? 3;
      const bucket = monthlyScores.get(monthKey) || { sum: 0, count: 0 };
      bucket.sum += score;
      bucket.count += 1;
      monthlyScores.set(monthKey, bucket);
    }

    const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const topThemes = Array.from(themeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme, count]) => ({ theme, count }));

    // Longest run of consecutive journaled days -- distinct from the
    // dashboard's "current streak" (which only ever counts backward from
    // today); this is the best run at any point across the whole window,
    // the actual "wrapped"-style highlight worth celebrating.
    const sortedDays = Array.from(uniqueDays).sort();
    let longestStreak = 0;
    let currentRun = 0;
    let prevDate = null;
    for (const key of sortedDays) {
      const d = new Date(`${key}T00:00:00`);
      currentRun = prevDate && Math.round((d - prevDate) / 86400000) === 1 ? currentRun + 1 : 1;
      longestStreak = Math.max(longestStreak, currentRun);
      prevDate = d;
    }

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    function labelMonth(monthKey) {
      if (!monthKey) return null;
      const [y, m] = monthKey.split("-").map(Number);
      return `${monthNames[m - 1]} ${y}`;
    }
    const monthlyAvgs = Array.from(monthlyScores.entries())
      // A single-entry month swinging the "best/hardest month" title off one
      // data point would be misleading -- require at least 3 entries logged
      // that month before it's eligible.
      .filter(([, v]) => v.count >= 3)
      .map(([month, v]) => ({ month, avg: v.sum / v.count, count: v.count }));
    const bestMonth = monthlyAvgs.length ? monthlyAvgs.slice().sort((a, b) => b.avg - a.avg)[0] : null;
    const hardestMonth = monthlyAvgs.length ? monthlyAvgs.slice().sort((a, b) => a.avg - b.avg)[0] : null;

    let correlationHighlight = null;
    try {
      const correlations = computeHealthMoodCorrelations({ healthRows, journalRows: entries });
      correlationHighlight = correlations?.description || null;
    } catch {
      correlationHighlight = null;
    }

    res.json({
      hasData: true,
      memberSince: firstEverEntry?.createdAt || entries[0].createdAt,
      totalEntries: entries.length,
      daysJournaled: uniqueDays.size,
      totalWords,
      longestStreak,
      topMood,
      moodCounts,
      topThemes,
      bestMonth: bestMonth ? { label: labelMonth(bestMonth.month), avg: bestMonth.avg, count: bestMonth.count } : null,
      hardestMonth: hardestMonth
        ? { label: labelMonth(hardestMonth.month), avg: hardestMonth.avg, count: hardestMonth.count }
        : null,
      correlationHighlight,
    });
  }),
);

export default router;
