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
    // Opt-in only -- previously the "core memory" feature (now Keepsakes,
    // see MoodGlobeLauncher.jsx) auto-selected entries algorithmically
    // (today's entry, or whatever tied to your single most recurring theme),
    // which meant the app was deciding what counted as meaningful on your
    // behalf. This is a real, explicit flag someone sets themselves at
    // write-time ("save this as a Keepsake") -- nothing is a Keepsake unless
    // a person actually marked it as one.
    isKeepsake: { type: Boolean, default: false },
    // Time capsule -- null for a normal entry. When set to a future date,
    // this entry is a letter to a future version of the person writing it:
    // excluded from every normal listing (recent entries, history, search,
    // mood calendar, on-this-day, theme cloud -- see the revealAt guards
    // added to those queries in journal/routes.js and dashboard/routes.js)
    // until that date actually arrives, then it just becomes a normal
    // visible entry from that point on. Deliberately NOT its own separate
    // model/collection -- it's still a real journal entry with a real mood
    // and real content, just one with a delayed reveal.
    revealAt: { type: Date, default: null },
    themes: {
      type: String,
      default: null,
      set: encryptArrayField,
      get: decryptArrayField,
    },
    // A local-model embedding vector of `content`, used for semantic
    // (meaning-based) recall in Chat/Retrospect instead of only keyword
    // overlap -- see shared/services/embeddings.js. Deliberately left
    // unencrypted, unlike every other content-derived field above: Mongo
    // can't run vector similarity math over an encrypted blob, and an
    // embedding is not human-readable on its own. That said, embeddings CAN
    // in principle be partially inverted back toward the source text
    // (a known, real privacy consideration) -- an accepted scope tradeoff
    // for this project's single-user local deployment, not something that
    // should be carried as-is into a multi-user production system without
    // real thought (e.g. encrypting at rest and only decrypting in-memory
    // for the similarity pass). `select: false` keeps it out of normal
    // find()/toJSON() responses (it's a large array of floats nothing in
    // the UI needs) -- callers doing similarity search explicitly
    // `.select("+embedding")`.
    embedding: {
      type: [Number],
      default: undefined,
      select: false,
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

