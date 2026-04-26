import mongoose from "mongoose";

const healthDataSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    sleepHours: { type: Number, default: 0 },
    steps: { type: Number, default: 0 },
    stressScore: { type: Number, default: 0 },
    restingHeartRate: { type: Number, default: 0 },
    completeness: { type: Number, default: 0.8 },
    confidence: { type: Number, default: 0.8 },
    source: { type: String, default: "seed" },
  },
  { timestamps: true },
);

healthDataSchema.index({ userId: 1, date: -1 });

export default mongoose.model("HealthData", healthDataSchema);

