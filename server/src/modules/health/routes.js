import { Router } from "express";
import HealthData from "../../models/HealthData.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { requireHealthSyncToken } from "../../shared/middleware/healthSyncAuth.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";

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

router.get(
  "/overview",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await HealthData.find({ userId: req.user._id }).sort({ date: -1 }).limit(30);
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
      insight:
        rows.length >= 7
          ? "Your stress trend is improving as movement and consistency increase."
          : "Add more health entries to unlock stronger mind-body correlation insights.",
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

    const update = {
      source: "apple_health",
      completeness: Number((providedCount / 3).toFixed(2)),
      confidence: 0.9,
      stressScore: estimateStressScore({ restingHeartRate, sleepHours, heartRateVariability }),
    };
    if (steps !== undefined) update.steps = steps;
    if (sleepHours !== undefined) update.sleepHours = sleepHours;
    if (restingHeartRate !== undefined) update.restingHeartRate = restingHeartRate;

    const row = await HealthData.findOneAndUpdate(
      { userId: req.user._id, date },
      { $set: update, $setOnInsert: { userId: req.user._id, date } },
      { upsert: true, new: true },
    );

    res.json({ ok: true, date: row.date, steps: row.steps, sleepHours: row.sleepHours, restingHeartRate: row.restingHeartRate, stressScore: row.stressScore });
  }),
);

export default router;
