import mongoose from "mongoose";

const chatTurnSchema = new mongoose.Schema(
  {
    userMessage: { type: String, required: true },
    aiResponse: { type: String, required: true },
    evidence: [
      {
        journalId: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry" },
        quote: String,
        date: Date,
      },
    ],
    confidence: { type: Number, default: 0 },
    fallback: { type: Boolean, default: false },
    reasoning: { type: String, default: "" },
    focus: { type: String, default: "general_reflection" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const chatSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    turns: [chatTurnSchema],
  },
  { timestamps: true },
);

chatSessionSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model("ChatSession", chatSessionSchema);

