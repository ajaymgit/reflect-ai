import { Router } from "express";
import HealthData from "../../models/HealthData.js";
import JournalEntry from "../../models/JournalEntry.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireHealthSyncToken } from "../../shared/middleware/healthSyncAuth.js";
import { validateRequest } from "../../shared/middleware/validateRequest.js";
import { manualHealthEntrySchema } from "../../shared/validators/healthSchemas.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { computeHealthMoodCorrelations, MOOD_SCORE } from "../../shared/utils/correlation.js";
import { visibleJournalFilter } from "../../shared/utils/visibleJournal.js";

const router = Router();

// HealthKit has no "stress score" -- Apple doesn't expose one via a public
// API. This is a simple, openly-approximate heuristic from three signals
// HealthKit does provide (resting heart rate, sleep duration, heart rate
// variability), not a medical-grade measurement. Baseline 50, nudged by how
// each present signal deviates from a normal-ish reference point; any
// missing signal just contributes nothing rather than being guessed at.
function estimateStressScore({ restingHeartRate, sleepHours, heartRateVariability }) {
  let score = 50;
  if (Number.isFinite(restingHeartRate)) score += (restingHeartRate - 62) * 1.1;
  if (Number.isFinite(sleepHours)) score += (7 - sleepHours) * 6;
  if (Number.isFinite(heartRateVariability)) score += (50 - heartRateVariability) * 0.6;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function parseDayDate(raw) {
  const isValidDayString = /^\d{4}-\d{2}-\d{2}$/.test(String(raw || ""));
  const d = isValidDayString ? new Date(`${raw}T00:00:00`) : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function avg(rows, key, fixed = 0) {
  if (!rows.length) return 0;
  const value = rows.reduce((sum, row) => sum + (row[key] || 0), 0) / rows.length;
  return fixed > 0 ? Number(value.toFixed(fixed)) : Math.round(value);
}

function getStatus(stressScore = 0) {
  if (stressScore >= 70) return "Needs attention";
  if (stressScore >= 45) return "Moderate";
  return "Good";
}

// Both /sync and /manual-entry only ever send whichever signals they
// actually have for a given calendar day -- a phone syncing steps mid-
// afternoon has no sleep number yet; someone correcting yesterday's step
// count by hand isn't resubmitting their resting heart rate. estimateStressScore
// was being called with ONLY this request's own body every time, so a
// partial follow-up write for a day that already had a fuller row (e.g. an
// Apple Health sync with restingHeartRate + sleepHours, then a same-day
// manual steps-only correction) silently reset stressScore to the
// no-signals baseline (50) -- discarding a real, still-correct heart-rate/
// sleep-based score even though neither of those fields changed or were
// ever asked to change. This fetches whatever's already stored for that day
// and falls back to it for any signal the current request didn't send, so
// the derived stressScore reflects the day's best-known data, not just
// whatever happened to be in this one request.
async function resolveStressInputs(userId, date, { restingHeartRate, sleepHours, heartRateVariability }) {
  const existing = await HealthData.findOne({ userId, date }).select("restingHeartRate sleepHours");
  return {
    restingHeartRate: restingHeartRate !== undefined ? restingHeartRate : existing?.restingHeartRate,
    sleepHours: sleepHours !== undefined ? sleepHours : existing?.sleepHours,
    // Not a persisted field (see models/HealthData.js) -- HRV only ever
    // exists for the duration of the request that sent it, so there's
    // nothing stored to fall back to.
    heartRateVariability,
  };
}

// Shared by /sync and /manual-entry -- both rely on findOneAndUpdate's
// upsert to enforce "one HealthData row per user per day" (see the unique
// index comment in models/HealthData.js), but that upsert isn't atomic
// against two near-simultaneous writes for the same day: both requests can
// race to see no existing row and both attempt an insert, in which case the
// unique index correctly lets exactly one succeed and makes the other throw
// a MongoDB E11000 duplicate-key error instead of silently creating a
// second row. This wraps that race: on a duplicate-key error, the losing
// request's row now definitely exists (the winner just created it), so a
// second findOneAndUpdate WITHOUT upsert applies this request's own update
// on top of it -- the net result is the same as if the two requests had
// been strictly sequential, and no request ever fails or silently loses its
// data because of timing.
async function upsertHealthDataDay(filter, update) {
  try {
    return await HealthData.findOneAndUpdate(
      filter,
      { $set: update, $setOnInsert: filter },
      { upsert: true, new: true },
    );
  } catch (err) {
    if (err?.code === 11000) {
      return HealthData.findOneAndUpdate(filter, { $set: update }, { new: true });
    }
    throw err;
  }
}

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// One mood score per day, most-recent-entry-per-day wins -- same convention
// used by correlation.js and the dashboard's mood calendar. Used to overlay
// mood directly onto the weekly health trend chart so the Health page can
// show "here's steps/sleep AND mood on the same days" in one chart instead
// of making someone flip to the separate Connections tab to see the two
// relate at all.
function moodScoreByDay(journalRows) {
  const map = new Map();
  for (const entry of journalRows) {
    const key = dayKey(entry.createdAt);
    const existing = map.get(key);
    if (!existing || new Date(entry.createdAt) > new Date(existing.date)) {
      map.set(key, { date: entry.createdAt, score: MOOD_SCORE[entry.mood] ?? null });
    }
  }
  return map;
}

router.get(
  "/overview",
  requireAuth,
  asyncHandler(async (req, res) => {
    // A wider window than `rows` (60 days of health + journals) purely for
    // computing correlations -- more paired days makes for a more reliable
    // Pearson coefficient than the 30-day window everything else on this
    // page uses. Kept separate from `rows` so the existing weekly/monthly
    // averages and trend chart are completely unaffected.
    const [rows, correlationHealthRows, correlationJournalRows] = await Promise.all([
      HealthData.find({ userId: req.user._id }).sort({ date: -1 }).limit(30),
      HealthData.find({ userId: req.user._id }).sort({ date: -1 }).limit(60),
      // visibleJournalFilter excludes time-capsule entries not yet due --
      // otherwise a sealed capsule's mood could skew the Pearson
      // correlation or show up as the mood overlaid on a day's point in
      // the weekly trend chart, before its reveal date.
      JournalEntry.find(visibleJournalFilter({ userId: req.user._id })).sort({ createdAt: -1 }).limit(90).select("mood createdAt"),
    ]);
    const correlations = computeHealthMoodCorrelations({
      healthRows: correlationHealthRows,
      journalRows: correlationJournalRows,
    });
    // Reuses the same 90-day journal fetch already made for correlations --
    // no extra query -- just re-keyed by day so the weekly trend chart can
    // overlay "and here's the mood that day" on the same axis as steps/sleep.
    const moodByDay = moodScoreByDay(correlationJournalRows);
    const latest = rows[0] || null;
    const weeklyRows = rows.slice(0, 7);
    const monthlyRows = rows.slice(0, 30);
    const monthlyStepAvg = avg(monthlyRows, "steps");
    const averageScreenTime = monthlyRows.length
      ? Number((Math.max(1.2, 4.8 - avg(monthlyRows, "sleepHours", 1) * 0.22 + avg(monthlyRows, "stressScore") * 0.015)).toFixed(1))
      : 0;

    res.json({
      latest: latest
        ? {
            steps: latest.steps,
            sleepHours: latest.sleepHours,
            stressScore: latest.stressScore,
            restingHeartRate: latest.restingHeartRate,
          }
        : null,
      weekly: rows
        .slice()
        .reverse()
        .map((r) => ({
          date: r.date,
          steps: r.steps,
          sleep: r.sleepHours,
          stress: r.stressScore,
          heartRate: r.restingHeartRate,
          mood: moodByDay.get(dayKey(r.date))?.score ?? null,
        })),
      averages: {
        weekly: {
          steps: avg(weeklyRows, "steps"),
          sleepHours: avg(weeklyRows, "sleepHours", 1),
          stressScore: avg(weeklyRows, "stressScore"),
        },
        monthly: {
          steps: monthlyStepAvg,
          sleepHours: avg(monthlyRows, "sleepHours", 1),
          stressScore: avg(monthlyRows, "stressScore"),
          screenTimeHours: averageScreenTime,
          calories: monthlyStepAvg ? Math.round(monthlyStepAvg * 0.04) : 0,
        },
      },
      streakDays: weeklyRows.filter((item) => item.completeness >= 0.7).length,
      // Previously this always computed a status label even with zero rows --
      // avg() defaults to 0 for an empty array, and getStatus(0) is "Good",
      // so a brand-new account with no health data at all was told its status
      // was "Good". A distinct, honest string here needs no client change:
      // HealthPage.jsx's `data?.status || "Loading..."` still renders it
      // normally since it's a non-empty string, not null/undefined.
      status: rows.length ? getStatus(avg(weeklyRows, "stressScore")) : "No data yet",
      // Previously two hardcoded sentences picked only by whether rows.length
      // >= 7 -- "improving" was shown to every user with a week of data
      // regardless of whether their trend was actually improving, flat, or
      // worsening. Now a real Pearson correlation computed from that
      // person's own health + mood data (see shared/utils/correlation.js),
      // with an honest "not enough data" message when there genuinely isn't
      // enough paired data yet to say anything.
      insight:
        correlations.description ||
        "Add more health entries and journal entries on the same days to unlock a real mind-body correlation.",
      correlations: correlations.results,
    });
  }),
);

// Ingest endpoint for the Apple Health companion app -- authenticated by the
// long-lived sync token (see /api/auth/health-sync-token), not a normal login
// session, since this runs unattended in the background. Upserts one row per
// calendar day so a phone that syncs every hour just keeps refining that
// day's numbers instead of creating duplicate rows.
router.post(
  "/sync",
  requireHealthSyncToken,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const date = parseDayDate(body.date);
    if (!date) {
      return res.status(400).json({ code: "INVALID_DATE", message: "date must be YYYY-MM-DD." });
    }

    const steps = Number.isFinite(Number(body.steps)) ? Math.round(Number(body.steps)) : undefined;
    const sleepHours = Number.isFinite(Number(body.sleepHours)) ? Number(Number(body.sleepHours).toFixed(2)) : undefined;
    const restingHeartRate = Number.isFinite(Number(body.restingHeartRate))
      ? Math.round(Number(body.restingHeartRate))
      : undefined;
    const heartRateVariability = Number.isFinite(Number(body.heartRateVariability))
      ? Number(body.heartRateVariability)
      : undefined;

    const providedCount = [steps, sleepHours, restingHeartRate].filter((v) => v !== undefined).length;
    if (providedCount === 0) {
      return res.status(400).json({ code: "NO_DATA", message: "At least one of steps, sleepHours, restingHeartRate is required." });
    }

    const stressInputs = await resolveStressInputs(req.user._id, date, {
      restingHeartRate,
      sleepHours,
      heartRateVariability,
    });
    const update = {
      source: "apple_health",
      completeness: Number((providedCount / 3).toFixed(2)),
      confidence: 0.9,
      stressScore: estimateStressScore(stressInputs),
    };
    if (steps !== undefined) update.steps = steps;
    if (sleepHours !== undefined) update.sleepHours = sleepHours;
    if (restingHeartRate !== undefined) update.restingHeartRate = restingHeartRate;

    const row = await upsertHealthDataDay({ userId: req.user._id, date }, update);

    res.json({ ok: true, date: row.date, steps: row.steps, sleepHours: row.sleepHours, restingHeartRate: row.restingHeartRate, stressScore: row.stressScore });
  }),
);

// Manual counterpart to /sync -- same upsert-by-day logic and the same
// estimateStressScore() heuristic, but reachable from the web app itself
// under a normal login session instead of requiring the iOS companion app
// and its separate sync token. Defaults to today when no date is given,
// and clamps any future date back to today (a "log today's data" form has
// no legitimate reason to backdate into the future).
router.post(
  "/manual-entry",
  requireAuth,
  validateRequest(manualHealthEntrySchema),
  asyncHandler(async (req, res) => {
    const { date: rawDate, steps, sleepHours, restingHeartRate } = req.validated.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let date = rawDate ? new Date(rawDate) : today;
    date.setHours(0, 0, 0, 0);
    if (date > today) date = today;

    const providedCount = [steps, sleepHours, restingHeartRate].filter((v) => v !== undefined).length;

    const stressInputs = await resolveStressInputs(req.user._id, date, { restingHeartRate, sleepHours });
    const update = {
      source: "manual",
      completeness: Number((providedCount / 3).toFixed(2)),
      confidence: 0.7,
      stressScore: estimateStressScore(stressInputs),
    };
    if (steps !== undefined) update.steps = steps;
    if (sleepHours !== undefined) update.sleepHours = sleepHours;
    if (restingHeartRate !== undefined) update.restingHeartRate = restingHeartRate;

    const row = await upsertHealthDataDay({ userId: req.user._id, date }, update);

    res.json({
      ok: true,
      date: row.date,
      steps: row.steps,
      sleepHours: row.sleepHours,
      restingHeartRate: row.restingHeartRate,
      stressScore: row.stressScore,
    });
  }),
);

export default router;
