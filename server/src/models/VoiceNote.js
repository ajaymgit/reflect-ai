import mongoose from "mongoose";
import { encryptField, decryptField } from "../shared/utils/encryption.js";

// A recorded voice note's actual audio bytes, base64-encoded and encrypted
// at rest the same way JournalEntry.content and ChatSession turns' own
// userMessage are -- a recording of someone's voice is at least as personal
// as the text they'd otherwise have typed.
//
// Deliberately its OWN collection, one document per voice note, rather than
// embedding the audio directly inside ChatSession.turns (where the rest of
// a chat turn's data lives). ChatSession is a single document per user that
// every turn gets pushed onto forever (see chat/service.js's
// appendChatTurn) -- MongoDB caps a single document at 16MB, and text-only
// turns take years of daily use to approach that. Audio blobs are orders of
// magnitude bigger per turn; embedding them directly would make that same
// document balloon toward the hard limit within months of regular
// voice-note use, corrupting someone's entire chat history at once instead
// of just one voice note. A turn instead stores only a lightweight
// { id, durationSec, mimeType } reference (see ChatSession.js's
// chatTurnSchema.voiceNote) and the real bytes are fetched on demand, only
// when someone actually presses play -- see modules/voiceNotes/routes.js.
const voiceNoteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    audio: { type: String, required: true, set: encryptField, get: decryptField },
    mimeType: { type: String, required: true },
    durationSec: { type: Number, required: true },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

voiceNoteSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("VoiceNote", voiceNoteSchema);
