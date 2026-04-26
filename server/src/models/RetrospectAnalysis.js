import mongoose from "mongoose";

const retrospectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    summary: { type: String, required: true },
    detectedPatterns: [{ type: String }],
    socraticQuestion: { type: String },
    confidence: { type: Number, default: 0.7 },
  },
  { timestamps: true },
);

export default mongoose.model("RetrospectAnalysis", retrospectSchema);

