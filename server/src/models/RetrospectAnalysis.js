import mongoose from "mongoose";
import { encryptField, decryptField, encryptArrayField, decryptArrayField } from "../shared/utils/encryption.js";

// summary/socraticQuestion/detectedPatterns describe recurring emotional/
// behavioral patterns detected from someone's actual journal content --
// encrypted at rest for the same reason JournalEntry.content is. confidence
// is a plain metadata number, left unencrypted.
const retrospectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    summary: {
      type: String,
      required: true,
      set: encryptField,
      get: decryptField,
    },
    detectedPatterns: {
      type: String,
      default: null,
      set: encryptArrayField,
      get: decryptArrayField,
    },
    socraticQuestion: {
      type: String,
      set: (v) => (v === null || v === undefined ? v : encryptField(v)),
      get: (v) => (v === null || v === undefined ? v : decryptField(v)),
    },
    // Added alongside real AI generation of the Retrospect page -- previously
    // these two were hardcoded, identical for every user, and never actually
    // stored anywhere. Same encryption treatment as detectedPatterns/
    // socraticQuestion since these also describe real, specific personal
    // patterns derived from someone's actual journal/health data.
    behavioralLoops: {
      type: String,
      default: null,
      set: encryptArrayField,
      get: decryptArrayField,
    },
    healthCorrelation: {
      type: String,
      default: null,
      set: (v) => (v === null || v === undefined ? v : encryptField(v)),
      get: (v) => (v === null || v === undefined ? v : decryptField(v)),
    },
    confidence: { type: Number, default: 0.7 },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

export default mongoose.model("RetrospectAnalysis", retrospectSchema);

