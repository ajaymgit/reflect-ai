import mongoose from "mongoose";

const hypothesisEvidenceSchema = new mongoose.Schema(
  {
    journalId: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", required: true },
    quote: { type: String, default: "" },
    mood: { type: String, default: "reflective" },
    date: { type: Date, required: true },
    verdict: { type: String, enum: ["supports", "weakens", "contradicts", "neutral"], required: true },
  },
  { _id: false },
);

const confidencePointSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    confidence: { type: Number, default: 0 },
    supportCount: { type: Number, default: 0 },
    contradictionCount: { type: Number, default: 0 },
  },
  { _id: false },
);

const personalHypothesisSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    hypothesisKey: { type: String, required: true },
    hypothesisText: { type: String, required: true },
    sourceSignals: [{ type: String }],
    focus: { type: String, default: "general_reflection" },
    status: {
      type: String,
      enum: ["detected", "testing", "supported", "weakened", "contradicted", "retired"],
      default: "detected",
    },
    confidence: { type: Number, default: 0 },
    supportCount: { type: Number, default: 0 },
    contradictionCount: { type: Number, default: 0 },
    neutralCount: { type: Number, default: 0 },
    evidence: [hypothesisEvidenceSchema],
    confidenceTimeline: [confidencePointSchema],
    firstSeenAt: { type: Date, default: Date.now },
    lastEvaluatedAt: { type: Date, default: Date.now },
    claimLock: {
      strongClaimsAllowed: { type: Boolean, default: false },
      reason: { type: String, default: "Hypothesis is not supported yet." },
    },
  },
  { timestamps: true },
);

personalHypothesisSchema.index({ userId: 1, hypothesisKey: 1 }, { unique: true });
personalHypothesisSchema.index({ userId: 1, status: 1, updatedAt: -1 });

export default mongoose.model("PersonalHypothesis", personalHypothesisSchema);
