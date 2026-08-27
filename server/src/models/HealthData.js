import mongoose from "mongoose";
import { encryptField, decryptField } from "../shared/utils/encryption.js";

// The actual personal health metrics (sleep, steps, stress, heart rate) are
// encrypted at rest -- these fields are declared as String (not Number) so
// the DB stores the encrypted blob, with get/set transparently converting
// to/from a real Number for application code (dashboard/health/retrospect
// routes all read these as plain numbers via normal property access, e.g.
// `row.stressScore`, completely unchanged). completeness/confidence/source
// are metadata about the reading itself, not the health values, and are
// left unencrypted.
function encryptNumber(v) {
  if (v === null || v === undefined) return v;
  return encryptField(String(v));
}
function decryptNumber(v) {
  // Returns null (not 0) when the field was never actually recorded --
  // /manual-entry and /sync both only set whichever fields were actually
  // provided (see health/routes.js's `if (x !== undefined) update.x = x`),
  // so a day logged with just steps genuinely has no stored sleepHours /
  // stressScore / restingHeartRate at all, not a real zero. Returning 0
  // here previously made every `Number.isFinite(row.field)` check
  // downstream (HealthPage's "Resting heart rate today" line,
  // correlation.js's per-metric pairing, Retrospect's AI health-data
  // payload) treat "never logged" as "logged as exactly 0" -- a real bug:
  // a 0 bpm resting heart rate rendered on-screen for data that was simply
  // never entered, and correlation.js counting those phantom-zero days as
  // real paired samples in its Pearson math. null correctly fails
  // Number.isFinite so all of that "was this actually recorded" logic
  // works as originally intended.
  if (v === null || v === undefined) return null;
  const decrypted = decryptField(v);
  const parsed = Number(decrypted);
  return Number.isFinite(parsed) ? parsed : null;
}

const healthDataSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    sleepHours: { type: String, set: encryptNumber, get: decryptNumber },
    steps: { type: String, set: encryptNumber, get: decryptNumber },
    stressScore: { type: String, set: encryptNumber, get: decryptNumber },
    restingHeartRate: { type: String, set: encryptNumber, get: decryptNumber },
    completeness: { type: Number, default: 0.8 },
    confidence: { type: Number, default: 0.8 },
    source: { type: String, default: "seed" },
  },
  {
    timestamps: true,
    // See JournalEntry.js for why this is required -- without it, implicit
    // res.json(doc) serialization would send raw encrypted blobs instead of
    // decrypted numbers.
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

// unique: true turns this into the actual data-integrity guarantee every
// caller assumes ("one HealthData row per user per calendar day") rather
// than just a performance index. Both /sync (Apple Health companion app)
// and /manual-entry rely on findOneAndUpdate(..., { upsert: true }) against
// this exact { userId, date } shape to enforce that -- but findOneAndUpdate's
// upsert is NOT atomic against a race without a unique index backing the
// filter: two near-simultaneous writes for the same day (a manual entry
// landing at the same moment as the phone's background sync, or a fast
// double-submit before either request's upsert has committed) could each
// fail to see the other's insert and create two separate rows for one
// calendar day. Every average/correlation in health/routes.js,
// correlation.js, and dashboard/routes.js assumes exactly one row per day
// and would silently double-weight that day if a duplicate ever existed.
// See the retry-on-duplicate-key wrapper in health/routes.js's upsertHealthDataDay,
// which handles the resulting E11000 error from the losing side of the race.
healthDataSchema.index({ userId: 1, date: -1 }, { unique: true });

export default mongoose.model("HealthData", healthDataSchema);

