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

    // Real, deterministic stats -- not an AI guess -- same "actual computed
    // math, not a model's impression" principle as the Pearson correlation
    // in health/routes.js. Reuses heatmapRows (already fetched above, up to
    // 400 entries, mood+createdAt only) rather than a separate query: a
    // meaningful "when do you actually write" pattern needs a much wider
    // sample than the 20-entry `entries` list this route already caps
    // everything else to.
    const HOUR_BUCKETS = [
      { id: "night", label: "Night", hours: [0, 1, 2, 3, 4, 5] },
      { id: "morning", label: "Morning", hours: [6, 7, 8, 9, 10, 11] },
      { id: "afternoon", label: "Afternoon", hours: [12, 13, 14, 15, 16, 17] },
      { id: "evening", label: "Evening", hours: [18, 19, 20, 21, 22, 23] },
    ];
    const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const hourToBucket = new Map();
    for (const bucket of HOUR_BUCKETS) {
      for (const h of bucket.hours) hourToBucket.set(h, bucket.id);
    }
    const byBucket = { night: 0, morning: 0, afternoon: 0, evening: 0 };
    const byWeekday = WEEKDAY_LABELS.map(() => 0);
    for (const row of heatmapRows) {
      const d = new Date(row.createdAt);
      byBucket[hourToBucket.get(d.getHours())] += 1;
      byWeekday[d.getDay()] += 1;
    }
    const totalForRhythm = heatmapRows.length;
    // Same MIN_ENTRIES_FOR_AI-style honesty bar as everything else here --
    // a handful of entries isn't enough to call something a "rhythm" without
    // it just being noise dressed up as a pattern.
    const rhythmEligible = totalForRhythm >= 5;
    const dominantBucket = rhythmEligible
      ? HOUR_BUCKETS.map((b) => ({ id: b.id, label: b.label, count: byBucket[b.id] })).sort(
          (a, b) => b.count - a.count,
        )[0]
      : null;
    const dominantWeekdayIndex = rhythmEligible
      ? byWeekday.reduce((best, count, i) => (count > byWeekday[best] ? i : best), 0)
      : null;
    const writingRhythm = {
      eligible: rhythmEligible,
      total: totalForRhythm,
      byBucket: HOUR_BUCKETS.map((b) => ({ id: b.id, label: b.label, count: byBucket[b.id] })),
      byWeekday: WEEKDAY_LABELS.map((label, i) => ({ label, count: byWeekday[i] })),
      dominantBucket: dominantBucket?.label || null,
      dominantWeekday:
        rhythmEligible && byWeekday[dominantWeekdayIndex] > 0 ? WEEKDAY_LABELS[dominantWeekdayIndex] : null,
    };

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
    // Previously just Array.from(new Set(...)).slice(0, 6) -- the first 6
    // DISTINCT themes in entry order, not the 6 most common. A theme that
    // showed up once in the oldest of these 20 entries could out-rank one
    // that showed up in half of them, purely by luck of chronological
    // position. Now actually ranked by frequency, same convention as the
    // Write page's theme-cloud endpoint below.
    const themeCounts = new Map();
    for (const e of entries) {
      for (const t of Array.isArray(e.themes) ? e.themes : []) {
        if (!t) continue;
        themeCounts.set(t, (themeCounts.get(t) || 0) + 1);
      }
    }
    const recurringThemes = Array.from(themeCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([theme]) => theme);

    res.json({
      dateRange: {
        from: entries[entries.length - 1]?.createdAt || null,
        to: entries[0]?.createdAt || null,
      },
      emotionalPatternSummary: topMood
        ? `Most frequent emotional tone across recent entries: ${topMood}.`
        : "Not enough journal entries yet to identify a recurring emotional tone.",
      recurringThemes,
      // Previously computed for topMood's ranking and then discarded --
      // never actually sent to the client. Dashboard's Retrospect preview
      // card now uses this for a real mini mood-balance chart instead of
      // just a summary sentence.
      moodCounts,
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
      writingRhythm,
      confidence: latest?.confidence ?? 0,
      analysisSource: latest?.source || "none",
    });
  }),
);

export default router;
