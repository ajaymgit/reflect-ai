import mongoose from "mongoose";
import { encryptField, decryptField, encryptArrayField, decryptArrayField } from "../shared/utils/encryption.js";

// content/title/tags/themes are the actual personal-reflection text a user
// writes (or keywords derived from it) -- these are encrypted at rest
// (AES-256-GCM, see shared/utils/encryption.js). `mood` is deliberately left
// unencrypted: it's a single value from a small fixed enum (not freeform
// text), and Retrospect's "most frequent mood" needs to read it directly.
// tags/themes are declared as String (not Mongoose arrays) because the
// whole array is JSON-serialized and encrypted as one blob -- see
// encryptArrayField/decryptArrayField.
const journalEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: {
      type: String,
      required: true,
      set: encryptField,
      get: decryptField,
    },
    // Previously the client had "title" and "tags" inputs, but they were
    // never sent as real fields -- JournalPage.jsx concatenated them into the
    // content string itself, so there was no way to search/filter by tag and
    // nothing here to actually store a title. Real fields now, both optional.
    title: {
      type: String,
      default: "",
      set: (v) => encryptField((v ?? "").trim()),
      get: (v) => decryptField(v) ?? "",
    },
    tags: {
      type: String,
      default: null,
      set: encryptArrayField,
      get: decryptArrayField,
    },
    mood: {
      type: String,
      enum: ["happy", "calm", "reflective", "sad", "stressed", "angry"],
      default: "reflective",
    },
    themes: {
      type: String,
      default: null,
      set: encryptArrayField,
      get: decryptArrayField,
    },
  },
  {
    timestamps: true,
    // Without this, res.json(doc)'s implicit serialization skips getters
    // entirely and would leak the raw encrypted blobs to the client instead
    // of decrypted plaintext -- direct property access (doc.content) applies
    // getters either way, but whole-document JSON serialization needs this
    // explicitly turned on.
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

journalEntrySchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("JournalEntry", journalEntrySchema);

