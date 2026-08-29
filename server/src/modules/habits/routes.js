import { Router } from "express";
import Habit from "../../models/Habit.js";
import HabitLog from "../../models/HabitLog.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { validateRequest } from "../../shared/middleware/validateRequest.js";
import { createHabitSchema, updateHabitSchema, toggleHabitLogSchema } from "../../shared/validators/habitSchemas.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { AppError } from "../../shared/utils/AppError.js";

const router = Router();

function todayAtMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDayOrToday(raw) {
  if (!raw) return todayAtMidnight();
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return todayAtMidnight();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(date) {
  // Monday-start week -- matches the rest of the app's weekday conventions
  // (JournalPage's weekday rhythm chart, Health's weekly averages).
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Current streak = consecutive calendar days ending today (or ending
// yesterday, if today just hasn't been logged yet -- today isn't over, so
// not-yet-done shouldn't zero out an otherwise-intact streak). Longest
// streak = the best run anywhere in the history, entirely independent of
// "today." Both computed from a plain Set of "YYYY-MM-DD" strings so a
// habit with months of logs is a handful of string comparisons, not a DB
// round trip per day.
export function computeStreaks(logDates, today = todayAtMidnight()) {
  const keys = new Set(logDates.map((d) => dayKey(d)));
  const todayKey = dayKey(today);

  let currentStreak = 0;
  const cursor = new Date(today);
  if (!keys.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
  while (keys.has(dayKey(cursor))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const sortedKeys = Array.from(keys).sort();
  let longestStreak = 0;
  let run = 0;
  let prevDate = null;
  for (const key of sortedKeys) {
    const d = new Date(`${key}T00:00:00`);
    if (prevDate) {
      const dayDiff = Math.round((d - prevDate) / 86400000);
      run = dayDiff === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    longestStreak = Math.max(longestStreak, run);
    prevDate = d;
  }

  return { currentStreak, longestStreak };
}

// `count` days ending today, oldest first -- last7Days (this week's toggle
// row, kept short for the compact Dashboard card) and heatmap (35 days / 5
// weeks, the GitHub-contributions-style read-only grid on the full Health
// page variant) are both just different lengths of the same shape.
function lastNDays(count, today = todayAtMidnight()) {
  return Array.from({ length: count }).map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (count - 1 - i));
    return d;
  });
}

// One shaping function for "a habit plus its computed stats," reused by
// GET / (bulk), POST / (a freshly created habit, no logs yet), PATCH /:id
// (after an edit -- name/icon/color can change without touching logs, so
// stats are still worth recomputing since the client replaces its whole row
// with this response), and the toggle endpoint. Previously each route
// hand-built its own slightly-different response shape -- POST/PATCH didn't
// include the heatmap at all, which would have made a newly-created or
// just-edited habit's row look different from every other row until the
// next full list reload.
function serializeHabit(habit, logDates, today = todayAtMidnight()) {
  const loggedKeys = new Set(logDates.map((d) => dayKey(d)));
  const { currentStreak, longestStreak } = computeStreaks(logDates, today);
  const week = startOfWeek(today);
  const completedThisWeek = logDates.filter((d) => new Date(d) >= week).length;
  return {
    id: habit._id,
    name: habit.name,
    icon: habit.icon,
    color: habit.color,
    targetPerWeek: habit.targetPerWeek,
    createdAt: habit.createdAt,
    todayCompleted: loggedKeys.has(dayKey(today)),
    currentStreak,
    longestStreak,
    completedThisWeek,
    last7Days: lastNDays(7, today).map((d) => ({ date: d, completed: loggedKeys.has(dayKey(d)) })),
    heatmap: lastNDays(35, today).map((d) => ({ date: d, completed: loggedKeys.has(dayKey(d)) })),
  };
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    // ?archived=true lists paused habits instead of active ones -- used by
    // the full Health-page tracker's "Archived" section so pausing
    // something isn't a one-way trip to the trash icon; it just moves the
    // habit there until someone wants it back (see PATCH .../archived:false
    // below for restoring).
    const wantArchived = req.query.archived === "true";
    const habits = await Habit.find({ userId: req.user._id, archived: wantArchived }).sort({ sortOrder: 1, createdAt: 1 });
    if (!habits.length) return res.json({ habits: [] });

    const today = todayAtMidnight();
    const habitIds = habits.map((h) => h._id);
    // One query for every habit's logs, not one query per habit -- the
    // per-habit split happens in memory below via habitId.toString(). Only
    // the last 35 days are ever rendered (heatmap is the longest view any
    // client shows), so there's no reason to pull someone's entire history
    // here.
    const since = lastNDays(35, today)[0];
    const logs = await HabitLog.find({ habitId: { $in: habitIds }, date: { $gte: since } }).select("habitId date");

    const logsByHabit = new Map();
    for (const log of logs) {
      const key = log.habitId.toString();
      if (!logsByHabit.has(key)) logsByHabit.set(key, []);
      logsByHabit.get(key).push(log.date);
    }

    res.json({
      habits: habits.map((habit) => serializeHabit(habit, logsByHabit.get(habit._id.toString()) || [], today)),
    });
  }),
);

router.post(
  "/",
  requireAuth,
  validateRequest(createHabitSchema),
  asyncHandler(async (req, res) => {
    const { name, icon, color, targetPerWeek } = req.validated.body;
    const count = await Habit.countDocuments({ userId: req.user._id, archived: false });
    const habit = await Habit.create({
      userId: req.user._id,
      name,
      icon,
      color,
      targetPerWeek,
      sortOrder: count,
    });
    res.status(201).json(serializeHabit(habit, []));
  }),
);

router.patch(
  "/:id",
  requireAuth,
  validateRequest(updateHabitSchema),
  asyncHandler(async (req, res) => {
    const habit = await Habit.findOne({ _id: req.params.id, userId: req.user._id });
    if (!habit) throw new AppError("NOT_FOUND", "Habit not found.", 404);
    Object.assign(habit, req.validated.body);
    await habit.save();
    // Archiving a habit doesn't delete its logs (see DELETE below for the
    // one case that does) -- an archived habit can still be un-archived
    // later with its streak history intact, so stats are still recomputed
    // here rather than zeroed out.
    const since = lastNDays(35)[0];
    const logs = await HabitLog.find({ habitId: habit._id, date: { $gte: since } }).select("date");
    res.json(serializeHabit(habit, logs.map((l) => l.date)));
  }),
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const habit = await Habit.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!habit) throw new AppError("NOT_FOUND", "Habit not found.", 404);
    // Logs have no independent meaning once their habit is gone -- an
    // orphaned HabitLog would just be dead rows nothing ever reads again.
    await HabitLog.deleteMany({ habitId: habit._id });
    res.json({ ok: true });
  }),
);

// Toggle a single day's completion -- creates the log row if it doesn't
// exist, deletes it if it does. The unique { habitId, date } index (see
// models/HabitLog.js) is what makes a fast double-click safe: the loser of
// a create-race hits a duplicate-key error, treated the same as "already
// existed."
router.post(
  "/:id/toggle",
  requireAuth,
  validateRequest(toggleHabitLogSchema),
  asyncHandler(async (req, res) => {
    const habit = await Habit.findOne({ _id: req.params.id, userId: req.user._id });
    if (!habit) throw new AppError("NOT_FOUND", "Habit not found.", 404);

    const date = parseDayOrToday(req.validated.body.date);
    const existing = await HabitLog.findOne({ habitId: habit._id, date });

    if (existing) {
      await HabitLog.deleteOne({ _id: existing._id });
    } else {
      try {
        await HabitLog.create({ userId: req.user._id, habitId: habit._id, date });
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }
    }

    const habitLogs = await HabitLog.find({ habitId: habit._id }).select("date");
    const dates = habitLogs.map((l) => l.date);
    const { currentStreak, longestStreak } = computeStreaks(dates);
    const week = startOfWeek(todayAtMidnight());
    const completedThisWeek = dates.filter((d) => new Date(d) >= week).length;

    const todayKey = dayKey(todayAtMidnight());
    res.json({
      id: habit._id,
      todayCompleted: dates.some((d) => dayKey(d) === todayKey),
      currentStreak,
      longestStreak,
      completedThisWeek,
    });
  }),
);

export default router;
