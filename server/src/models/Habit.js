import mongoose from "mongoose";
import { encryptField, decryptField } from "../shared/utils/encryption.js";

// A habit/goal someone is tracking (e.g. "Meditate", "No phone after 10pm",
// "Call mom") -- name is encrypted at rest the same way JournalEntry.content
// and RetrospectAnalysis.summary are, since what someone is trying to build
// or break is often as personally revealing as what they write about it.
// icon/color are just UI presentation, not personal content, so they stay
// plain. Completion itself lives in HabitLog (one row per habit per
// completed day), not here -- mirrors HealthData's one-row-per-day pattern.
const habitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, set: encryptField, get: decryptField },
    icon: { type: String, default: "target" },
    color: { type: String, default: "signal" },
    // How many days a week this is meant to happen -- not a streak-breaking
    // rule (streaks are simple consecutive-calendar-days, see
    // habits/routes.js's computeStreaks), just a lighter-weight "goal" framing
    // for things that were never meant to be daily (e.g. "gym 3x a week").
    targetPerWeek: { type: Number, default: 7, min: 1, max: 7 },
    archived: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

habitSchema.index({ userId: 1, archived: 1, sortOrder: 1 });

export default mongoose.model("Habit", habitSchema);
