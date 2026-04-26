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

router.get(
  "/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    const range = String(req.query.range || "week").toLowerCase();
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
    const wellness = Math.max(35, Math.min(95, 100 - Math.round(avgStress * 0.6)));

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
        title: j.content.slice(0, 42),
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

export default router;
