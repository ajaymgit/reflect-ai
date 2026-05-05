import { Router } from "express";
import JournalEntry from "../../models/JournalEntry.js";
import RetrospectAnalysis from "../../models/RetrospectAnalysis.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";

const router = Router();

router.get(
  "/analysis",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [entries, latest] = await Promise.all([
      JournalEntry.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(20),
      RetrospectAnalysis.findOne({ userId: req.user._id }).sort({ createdAt: -1 }),
    ]);

    const moodCounts = entries.reduce((acc, entry) => {
      acc[entry.mood] = (acc[entry.mood] || 0) + 1;
      return acc;
    }, {});

    const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "reflective";
    const recurringThemes = Array.from(
      new Set(entries.flatMap((e) => (Array.isArray(e.themes) ? e.themes : [])).filter(Boolean)),
    ).slice(0, 6);

    res.json({
      dateRange: {
        from: entries[entries.length - 1]?.createdAt || null,
        to: entries[0]?.createdAt || null,
      },
      emotionalPatternSummary: `Most frequent emotional tone across recent entries: ${topMood}.`,
      recurringThemes,
      behavioralLoops: [
        "High workload -> reduced breaks -> elevated stress",
        "Evening walks -> calmer state -> improved reflection quality",
      ],
      healthCorrelation:
        "Higher stress days align with lower movement and fragmented focus periods.",
      socraticQuestion:
        latest?.socraticQuestion ||
        "When this pattern appears, what is the first internal signal you notice?",
      timeline: entries
        .slice()
        .reverse()
        .map((e) => ({ date: e.createdAt, mood: e.mood, excerpt: e.content.slice(0, 80) })),
      confidence: latest?.confidence || 0.74,
    });
  }),
);

// Backward-compatible alias used by older scripts/clients.
router.get(
  "/latest",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [entries, latest] = await Promise.all([
      JournalEntry.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(20),
      RetrospectAnalysis.findOne({ userId: req.user._id }).sort({ createdAt: -1 }),
    ]);
    const moodCounts = entries.reduce((acc, entry) => {
      acc[entry.mood] = (acc[entry.mood] || 0) + 1;
      return acc;
    }, {});
    const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "reflective";
    res.json({
      emotionalPatternSummary: `Most frequent emotional tone across recent entries: ${topMood}.`,
      socraticQuestion:
        latest?.socraticQuestion ||
        "When this pattern appears, what is the first internal signal you notice?",
      confidence: latest?.confidence || 0.74,
    });
  }),
);

export default router;
