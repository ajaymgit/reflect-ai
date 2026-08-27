// Real (not AI-guessed) statistical correlation between health metrics and
// mood, used by both Health page's "insight" text/chart and Retrospect's AI
// generation -- previously both of those just said something generically
// plausible-sounding ("Your stress trend is improving...", or an LLM
// guessing from raw rows) regardless of what the data actually showed. This
// computes an honest Pearson correlation coefficient instead.
// Exported (not just module-local) so health/routes.js can attach a mood
// score to each day in its own weekly trend data without re-deriving its own
// copy of this mapping -- one source of truth for "what number does each
// mood word turn into," shared by the correlation math here and the
// mood-overlay trend chart on the Health page.
export const MOOD_SCORE = { happy: 5, calm: 4, reflective: 3, sad: 2, stressed: 1, angry: 0 };
const METRICS = [
  { key: "steps", label: "steps" },
  { key: "sleepHours", label: "sleep" },
  { key: "stressScore", label: "stress score" },
  { key: "restingHeartRate", label: "resting heart rate" },
];

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dayStr, n) {
  const [y, m, d] = dayStr.split("-").map(Number);
  const date = new Date(y, m - 1, d + n);
  return dayKey(date);
}

// Standard Pearson product-moment correlation coefficient. Returns null
// (not 0) when there isn't enough variance to compute one meaningfully --
// null is "can't tell", 0 would falsely read as "measured, and there's no
// relationship."
export function pearsonCorrelation(xs, ys) {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  if (denomX === 0 || denomY === 0) return null;
  return num / Math.sqrt(denomX * denomY);
}

// `testedCount` is the number of distinct (metric, lag) combinations that
// had enough paired days to even compute an r for -- up to 16 (4 metrics x
// 4 lags). `top` is picked as the single strongest |r| among all of those,
// which is exactly the setup for a multiple-comparisons false positive: with
// enough attempts, *something* will look "strong" by chance even when
// nothing real is going on, especially with only 6-8 paired days feeding
// each one. Stating that one winner as a flat fact ("Days with higher steps
// tend to be followed by higher mood...") would be the same kind of
// dishonest-by-omission chart this app has fixed before (see HealthPage's
// dense-fill gap-honesty work) -- just in prose instead of pixels. Naming
// how many comparisons were checked keeps the sentence honest without
// requiring an actual multiple-comparisons correction (Bonferroni etc. would
// need a much larger n than a personal journal realistically has).
function describeCorrelation({ metric, lag, r, n }, testedCount) {
  const strength = Math.abs(r) >= 0.6 ? "a strong" : Math.abs(r) >= 0.4 ? "a moderate" : "a weak";
  const direction = r > 0 ? "higher" : "lower";
  const metricLabel = METRICS.find((m) => m.key === metric)?.label || metric;
  const when = lag === 0 ? "that same day" : lag === 1 ? "the next day" : `${lag} days later`;
  const comparisonNote =
    testedCount > 1 ? `, strongest of ${testedCount} patterns checked` : "";
  return `Days with higher ${metricLabel} tend to be followed by ${direction} mood ${when} -- ${strength} correlation (r=${r.toFixed(2)}, n=${n} days${comparisonNote}).`;
}

// Tries every (metric, lag) combination up to maxLagDays and returns every
// combination that had enough paired days to compute a coefficient at all,
// sorted strongest-first by |r|. minSamples defaults to 6 -- small enough to
// work with a couple weeks of data, large enough that a correlation isn't
// being read off 2-3 coincidental days.
export function computeHealthMoodCorrelations({ healthRows, journalRows, maxLagDays = 3, minSamples = 6 }) {
  const moodByDay = new Map();
  // Most-recent-entry-per-day wins, matching the same convention used
  // elsewhere in this app (dashboard "todaysMood", mood-calendar).
  for (const entry of journalRows) {
    const key = dayKey(entry.createdAt);
    const existing = moodByDay.get(key);
    if (!existing || new Date(entry.createdAt) > new Date(existing.date)) {
      moodByDay.set(key, { date: entry.createdAt, score: MOOD_SCORE[entry.mood] ?? 3 });
    }
  }

  const healthByDay = new Map();
  for (const row of healthRows) {
    healthByDay.set(dayKey(row.date), row);
  }

  const results = [];
  for (const { key: metric } of METRICS) {
    for (let lag = 0; lag <= maxLagDays; lag += 1) {
      const xs = [];
      const ys = [];
      for (const [day, row] of healthByDay) {
        const moodEntry = moodByDay.get(addDays(day, lag));
        const value = row[metric];
        if (moodEntry && Number.isFinite(value)) {
          xs.push(value);
          ys.push(moodEntry.score);
        }
      }
      if (xs.length < minSamples) continue;
      const r = pearsonCorrelation(xs, ys);
      if (r === null) continue;
      // Raw paired points, not just the coefficient -- a scatter plot of
      // these is what actually lets someone see the relationship for
      // themselves (clusters, outliers, how tight or loose it really is)
      // instead of just trusting a single r number. Small enough (at most a
      // few dozen points per metric/lag) to include on every result rather
      // than needing a separate endpoint.
      results.push({
        metric,
        lag,
        r: Number(r.toFixed(3)),
        n: xs.length,
        points: xs.map((x, i) => ({ x, y: ys[i] })),
      });
    }
  }

  results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const top = results[0] || null;

  return {
    results,
    top,
    description: top ? describeCorrelation(top, results.length) : null,
  };
}
