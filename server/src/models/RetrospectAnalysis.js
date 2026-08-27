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

// Every query against this collection (latest-analysis lookups in
// retrospect/service.js and chat/service.js, the full-history export in
// export/routes.js) filters by userId, and two of those also sort by
// createdAt -- exactly the { userId, createdAt } compound index pattern
// already used on JournalEntry/ChatSession/AuditLog. This model was missing
// it, meaning every one of those reads did a full collection scan instead of
// an index seek. Harmless at demo-account scale, but grows linearly worse
// with real usage since it's on the hot path for the Retrospect page and
// Chat's context-building.
retrospectSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("RetrospectAnalysis", retrospectSchema);

