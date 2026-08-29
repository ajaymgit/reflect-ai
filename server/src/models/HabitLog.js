import mongoose from "mongoose";

// One row per habit per completed calendar day -- existence of the row IS
// the "done" signal, so toggling a day off deletes the row rather than
// flipping a boolean. That makes streak/history computation a plain "which
// dates exist" query (habits/routes.js's computeStreaks) with no need to
// filter out completed:false rows. No personal free-text lives here (just
// which habit, which day), so nothing needs encryption -- unlike Habit.name.
const habitLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    habitId: { type: mongoose.Schema.Types.ObjectId, ref: "Habit", required: true },
    date: { type: Date, required: true },
  },
  { timestamps: true },
);

// Same data-integrity role as HealthData's { userId, date } unique index --
// enforces "at most one log per habit per day" at the DB level, not just by
// convention, so a fast double-toggle can't create two rows for one day.
habitLogSchema.index({ habitId: 1, date: -1 }, { unique: true });
habitLogSchema.index({ userId: 1, date: -1 });

export default mongoose.model("HabitLog", habitLogSchema);
