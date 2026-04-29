import { Router } from "express";
import HealthData from "../../models/HealthData.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";

const router = Router();

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
      status: getStatus(avg(weeklyRows, "stressScore")),
      insight:
        rows.length >= 7
          ? "Your stress trend is improving as movement and consistency increase."
          : "Add more health entries to unlock stronger mind-body correlation insights.",
    });
  }),
);

// Backward-compatible alias used by older scripts/clients.
router.get(
  "/trends",
  requireAuth,
  asyncHandler(async (req, res) => {
    const days = Math.max(1, Math.min(60, Number(req.query.days) || 14));
    const rows = await HealthData.find({ userId: req.user._id }).sort({ date: -1 }).limit(days);
    res.json({
      days,
      points: rows
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
        steps: avg(rows, "steps"),
        sleepHours: avg(rows, "sleepHours", 1),
        stressScore: avg(rows, "stressScore"),
      },
    });
  }),
);

export default router;
