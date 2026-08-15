import { Router } from "express";
import JournalEntry from "../../models/JournalEntry.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { getOrRefreshRetrospectAnalysis } from "./service.js";

const router = Router();

router.get(
  "/analysis",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [entries, heatmapRows] = await Promise.all([
      JournalEntry.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(20),
      // A much wider window than `entries` (last 365 days, mood + date only --
      // mood isn't an encrypted field, so this is a cheap, un-decrypted
      // query) purely to feed the calendar heatmap below. The 20-entry
      // `entries` list is fine for "recent pattern" text and the bar-chart
      // timeline, but a "year in pixels"-style heatmap needs real day-by-day
      // coverage across a full year, not just the most recent handful of
      // entries someone happened to write.
      JournalEntry.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(400).select("mood createdAt"),
    ]);
    // Regenerates via Ollama when stale/missing (see service.js), falling
    // back to the latest cached analysis (or null for a brand-new account)
    // if generation isn't available right now.
    const latest = await getOrRefreshRetrospectAnalysis(req.user._id, { journalCount: entries.length });

    // One mood per calendar day, most-recent-entry-per-day wins (same
    // convention as correlation.js / health/routes.js) -- multiple entries
    // on the same day would otherwise render as overlapping/ambiguous cells.
    const heatmapByDay = new Map();
    for (const e of heatmapRows) {
      const d = new Date(e.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const existing = heatmapByDay.get(key);
      if (!existing || new Date(e.createdAt) > new Date(existing.rawDate)) {
        heatmapByDay.set(key, { date: key, rawDate: e.createdAt, mood: e.mood });
      }
    }
    const moodHeatmap = Array.from(heatmapByDay.values()).sort((a, b) => a.date.localeCompare(b.date));

    const moodCounts = entries.reduce((acc, entry) => {
      acc[entry.mood] = (acc[entry.mood] || 0) + 1;
      return acc;
    }, {});

    // Previously topMood defaulted to the literal string "reflective" when
    // moodCounts was empty, and that fallback was then presented as if it
    // were an observed fact ("Most frequent emotional tone... reflective.")
    // for accounts with zero journal entries. emotionalPatternSummary now
    // says so honestly instead. No client change needed: RetrospectPage.jsx's
    // `data?.emotionalPatternSummary || "Analyzing entries..."` still renders
    // this normally since it's a non-empty string, not null/undefined.
    const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const recurringThemes = Array.from(
      new Set(entries.flatMap((e) => (Array.isArray(e.themes) ? e.themes : [])).filter(Boolean)),
    ).slice(0, 6);

    res.json({
      dateRange: {
        from: entries[entries.length - 1]?.createdAt || null,
        to: entries[0]?.createdAt || null,
      },
      emotionalPatternSummary: topMood
        ? `Most frequent emotional tone across recent entries: ${topMood}.`
        : "Not enough journal entries yet to identify a recurring emotional tone.",
      recurringThemes,
      // Previously two hardcoded sentences shown identically to every user
      // regardless of their actual data. Now generated per-user from real
      // journal + health entries (see service.js) -- honest empty/placeholder
      // text when there isn't enough data yet, rather than fabricated
      // specifics.
      behavioralLoops: latest?.behavioralLoops || [],
      healthCorrelation: latest?.healthCorrelation || "Not enough data yet to identify a correlation.",
      socraticQuestion:
        latest?.socraticQuestion ||
        "When this pattern appears, what is the first internal signal you notice?",
      timeline: entries
        .slice()
        .reverse()
        .map((e) => ({ date: e.createdAt, mood: e.mood, excerpt: e.content.slice(0, 80) })),
      moodHeatmap,
      confidence: latest?.confidence ?? 0,
      analysisSource: latest?.source || "none",
    });
  }),
);

export default router;
