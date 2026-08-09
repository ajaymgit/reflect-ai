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
    confidence: { type: Number, default: 0.7 },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

export default mongoose.model("RetrospectAnalysis", retrospectSchema);

