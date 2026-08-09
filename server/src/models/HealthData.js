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
  if (v === null || v === undefined) return 0;
  const decrypted = decryptField(v);
  const parsed = Number(decrypted);
  return Number.isFinite(parsed) ? parsed : 0;
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

healthDataSchema.index({ userId: 1, date: -1 });

export default mongoose.model("HealthData", healthDataSchema);

