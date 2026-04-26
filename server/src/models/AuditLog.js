import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    triggerReason: { type: String, default: "chat_turn" },
    retrievedMemoryIds: [{ type: String }],
    detectedPatterns: [{ type: String }],
    evidenceIds: [{ type: String }],
    generatedQuestion: { type: String, default: "" },
    confidence: { type: Number, default: 0 },
    policyDecisions: { type: Object, default: {} },
    status: { type: String, enum: ["accepted", "rejected"], required: true },
    policyVersion: { type: String, required: true },
  },
  { timestamps: true },
);

auditLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);

