import { Router } from "express";
import JournalEntry from "../../models/JournalEntry.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { getOrRefreshRetrospectAnalysis } from "./service.js";
import { visibleJournalFilter } from "../../shared/utils/visibleJournal.js";

const router = Router();

router.get(
  "/analysis",
  requireAuth,
  asyncHandler(async (req, res) => {
    // visibleJournalFilter excludes time-capsule entries not yet due -- this
    // route's `timeline` field below includes a raw content excerpt per
    // entry, so without this guard a sealed capsule's actual text would be
    // exposed here before its reveal date (the one code path this bug hit
    // hardest -- everywhere else it only leaked mood/aggregate stats).
    const [entries, heatmapRows] = await Promise.all([
      JournalEntry.find(visibleJournalFilter({ userId: req.user._id })).sort({ createdAt: -1 }).limit(20),
      // A much wider window than `entries` (last 365 days, mood + date only --
      // mood isn't an encrypted field, so this is a cheap, un-decrypted
      // query) purely to feed the calendar heatmap below. The 20-entry
      // `entries` list is fine for "recent pattern" text and the bar-chart
      // timeline, but a "year in pixels"-style heatmap needs real day-by-day
      // coverage across a full year, not just the most recent handful of
      // entries someone happened to write.
      JournalEntry.find(visibleJournalFilter({ userId: req.user._id })).sort({ createdAt: -1 }).limit(400).select("mood createdAt"),
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
    const rankedThemes = Array.from(themeCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6);
    const recurringThemes = rankedThemes.map(([theme]) => theme);
    // Same ranked list as recurringThemes above, but with counts attached --
    // recurringThemes stays plain strings since DashboardPage's Retrospect
    // preview card already consumes it in that shape; this is a separate
    // field so RetrospectPage can render actual relative frequency (as
    // bars) instead of uniform pills that all look equally common.
    const themeFrequency = rankedThemes.map(([theme, count]) => ({ theme, count }));

    // Mood trend + mood-by-weekday -- both purely computed from
    // heatmapRows (the same up-to-400-row, mood+createdAt-only query
    // already fetched above for moodHeatmap/writingRhythm), so both are
    // free: no extra query, no AI involved. "Am I trending up or down" and
    // "which day of the week is hardest" are two of the most basic
    // questions a retrospective page can answer, and this route already
    // had the raw data for both without surfacing either.
    const MOOD_SCORE = { happy: 5, calm: 4, reflective: 3, sad: 2, stressed: 1, angry: 0 };
    const moodRows = heatmapRows
      .filter((r) => MOOD_SCORE[r.mood] !== undefined)
      .map((r) => ({
        mood: r.mood,
        score: MOOD_SCORE[r.mood],
        date: new Date(r.createdAt),
        weekday: new Date(r.createdAt).getDay(),
      }))
      .sort((a, b) => a.date - b.date);

    const MOOD_WEEKDAY_MIN_COUNT = 2;
    const moodByWeekdayRows = WEEKDAY_LABELS.map((label, i) => {
      const rows = moodRows.filter((r) => r.weekday === i);
      // dominantMood -- the single most-frequently-felt mood on this
      // weekday, separate from avgScore. Averaging several different moods
      // into one 0-5 number tends to land every day in the same murky
      // middle value, which made every weekday's bar render as roughly the
      // same color even on days that felt genuinely different. This is
      // "which emotion actually showed up most," not "what's the mean."
      const moodCounts = {};
      for (const r of rows) moodCounts[r.mood] = (moodCounts[r.mood] || 0) + 1;
      const dominantMood = rows.length
        ? Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0][0]
        : null;
      return {
        label,
        avgScore: rows.length ? rows.reduce((sum, r) => sum + r.score, 0) / rows.length : null,
        dominantMood,
        count: rows.length,
      };
    });
    const eligibleWeekdays = moodByWeekdayRows.filter((d) => d.count >= MOOD_WEEKDAY_MIN_COUNT);
    const bestWeekday = eligibleWeekdays.length
      ? eligibleWeekdays.reduce((best, d) => (d.avgScore > best.avgScore ? d : best))
      : null;
    const worstWeekday = eligibleWeekdays.length
      ? eligibleWeekdays.reduce((worst, d) => (d.avgScore < worst.avgScore ? d : worst))
      : null;
    const moodByWeekday = {
      eligible: eligibleWeekdays.length >= 3,
      byWeekday: moodByWeekdayRows,
      // Guard against best/worst collapsing onto the same day when only
      // one weekday has enough entries yet -- "best and worst are both
      // Tuesday" reads as a bug, not a pattern.
      bestWeekday: bestWeekday && bestWeekday.label !== worstWeekday?.label ? bestWeekday.label : null,
      worstWeekday: worstWeekday && worstWeekday.label !== bestWeekday?.label ? worstWeekday.label : null,
    };

    // Trend -- split the same chronologically-sorted rows into first/second
    // half and compare average score. A real delta over the actual window,
    // not a model's impression of the text.
    const MOOD_TREND_MIN_ROWS = 10;
    let moodTrend = { eligible: false, direction: "insufficient", delta: 0 };
    if (moodRows.length >= MOOD_TREND_MIN_ROWS) {
      const mid = Math.floor(moodRows.length / 2);
      const avg = (rows) => rows.reduce((sum, r) => sum + r.score, 0) / rows.length;
      const delta = avg(moodRows.slice(mid)) - avg(moodRows.slice(0, mid));
      const direction = delta > 0.4 ? "improving" : delta < -0.4 ? "declining" : "steady";
      moodTrend = { eligible: true, direction, delta: Math.round(delta * 100) / 100 };
    }

    // Theme-mood links -- which of the top recurring themes tends to show
    // up alongside which mood, using the same 20 decrypted `entries` this
    // route already has content+mood+themes for. Requires at least 2
    // occurrences of both the theme and its dominant mood before naming a
    // link, same honesty bar as everything else here -- a theme that
    // appeared once isn't a pattern.
    const themeMoodLinks = rankedThemes
      .map(([theme, count]) => {
        if (count < 2) return null;
        const moodCountsForTheme = {};
        for (const e of entries) {
          if (Array.isArray(e.themes) && e.themes.includes(theme)) {
            moodCountsForTheme[e.mood] = (moodCountsForTheme[e.mood] || 0) + 1;
          }
        }
        const [dominantMood, dominantCount] =
          Object.entries(moodCountsForTheme).sort((a, b) => b[1] - a[1])[0] || [];
        if (!dominantMood || dominantCount < 2) return null;
        return { theme, mood: dominantMood, count: dominantCount, of: count };
      })
      .filter(Boolean)
      .slice(0, 3);

    // Computed (non-AI) reflective prompts, templated from the real
    // patterns just found above -- supplements the single AI-generated
    // socraticQuestion below with a couple more that are always available
    // (no model call, no "not enough data" risk beyond the same eligibility
    // checks already applied to each pattern) and are traceable back to an
    // actual number rather than a model's phrasing choice.
    const reflectivePrompts = [];
    if (moodByWeekday.worstWeekday) {
      reflectivePrompts.push(
        `You've tended to feel lower on ${moodByWeekday.worstWeekday}s. What's usually different about that day?`,
      );
    }
    if (themeMoodLinks[0]) {
      reflectivePrompts.push(
        `"${themeMoodLinks[0].theme.replace(/_/g, " ")}" often comes up on days you felt ${themeMoodLinks[0].mood}. Is there a connection worth naming?`,
      );
    }
    if (moodTrend.eligible && moodTrend.direction !== "steady") {
      reflectivePrompts.push(
        `Your mood has been ${moodTrend.direction} lately. What's changed recently that might explain that?`,
      );
    }

    res.json({
      dateRange: {
        from: entries[entries.length - 1]?.createdAt || null,
        to: entries[0]?.createdAt || null,
      },
      emotionalPatternSummary: topMood
        ? `Most frequent emotional tone across recent entries: ${topMood}.`
        : "Not enough journal entries yet to identify a recurring emotional tone.",
      recurringThemes,
      themeFrequency,
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
      moodTrend,
      moodByWeekday,
      themeMoodLinks,
      reflectivePrompts,
      confidence: latest?.confidence ?? 0,
      analysisSource: latest?.source || "none",
    });
  }),
);

export default router;
