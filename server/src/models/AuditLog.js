import mongoose from "mongoose";
import { encryptField, decryptField, encryptArrayField, decryptArrayField } from "../shared/utils/encryption.js";

// detectedPatterns and generatedQuestion are content, not metadata, and were
// previously stored here in plaintext even though the exact same data is
// encrypted everywhere else it lives: detectedPatterns is the same theme
// strings as JournalEntry.themes (explicitly encrypted -- see that model's
// comment describing tags/themes as "keywords derived from" someone's actual
// journal text), and generatedQuestion is the AI's posed Socratic question,
// the same category of "AI's generated read on what someone disclosed" that
// justifies encrypting ChatSession.aiResponse/reasoning. A DB dump/backup
// leak would have exposed both in the clear here even though the app's own
// security model treats this kind of content as sensitive everywhere else.
// retrievedMemoryIds/evidenceIds are just Mongo ObjectId strings (not
// content) and policyDecisions/confidence/status/etc. are policy metadata
// about the turn, not its content -- both left unencrypted, same as
// ChatSession's confidence/fallback/focus fields.
const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    triggerReason: { type: String, default: "chat_turn" },
    retrievedMemoryIds: [{ type: String }],
    detectedPatterns: {
      type: String,
      default: null,
      set: encryptArrayField,
      get: decryptArrayField,
    },
    evidenceIds: [{ type: String }],
    generatedQuestion: {
      type: String,
      default: "",
      set: (v) => encryptField(v ?? ""),
      get: (v) => decryptField(v) ?? "",
    },
    confidence: { type: Number, default: 0 },
    policyDecisions: { type: Object, default: {} },
    status: { type: String, enum: ["accepted", "rejected"], required: true },
    policyVersion: { type: String, required: true },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

auditLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);

