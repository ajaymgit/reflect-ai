import mongoose from "mongoose";
import { encryptField, decryptField } from "../shared/utils/encryption.js";

// userMessage/aiResponse/reasoning/evidence[].quote are the actual chat
// conversation content -- arguably the most sensitive data in the app,
// since it's a direct record of what someone disclosed plus the AI's
// generated read on it. Encrypted at rest the same way as
// JournalEntry/HealthData (see shared/utils/encryption.js). confidence/
// fallback/focus/createdAt/journalId/date are metadata about the turn, not
// its content, and are left unencrypted (focus is a small fixed category
// label like "general_reflection", not freeform text).
// toJSON/toObject getters:true has to be set on EVERY nested schema level
// individually (the evidence sub-schema, the turn schema, AND the top-level
// session schema) -- it does NOT reliably inherit down from a parent's
// setting alone. Confirmed the hard way: GET /api/chat/session does
// `res.json({ turns: session.turns })`, which extracts the turns array out
// of the parent document BEFORE serializing it, bypassing the parent
// document's own toJSON() call chain entirely. Without this schema also
// declaring getters:true itself, that route leaked raw ciphertext instead
// of decrypted text even though the same data decrypted fine when returned
// as part of the whole session document elsewhere.
const evidenceSchema = new mongoose.Schema(
  {
    journalId: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry" },
    quote: {
      type: String,
      set: (v) => (v === null || v === undefined ? v : encryptField(v)),
      get: (v) => (v === null || v === undefined ? v : decryptField(v)),
    },
    date: Date,
  },
  { _id: false, toJSON: { getters: true }, toObject: { getters: true } },
);

const chatTurnSchema = new mongoose.Schema(
  {
    userMessage: {
      type: String,
      required: true,
      set: encryptField,
      get: decryptField,
    },
    aiResponse: {
      type: String,
      required: true,
      set: encryptField,
      get: decryptField,
    },
    evidence: [evidenceSchema],
    confidence: { type: Number, default: 0 },
    fallback: { type: Boolean, default: false },
    reasoning: {
      type: String,
      default: "",
      set: (v) => encryptField(v ?? ""),
      get: (v) => decryptField(v) ?? "",
    },
    focus: { type: String, default: "general_reflection" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false, toJSON: { getters: true }, toObject: { getters: true } },
);

const chatSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    turns: [chatTurnSchema],
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

chatSessionSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model("ChatSession", chatSessionSchema);

