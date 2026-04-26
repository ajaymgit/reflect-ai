import mongoose from "mongoose";

const journalEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    mood: {
      type: String,
      enum: ["happy", "calm", "reflective", "sad", "stressed", "angry"],
      default: "reflective",
    },
    themes: [{ type: String }],
  },
  { timestamps: true },
);

journalEntrySchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("JournalEntry", journalEntrySchema);

