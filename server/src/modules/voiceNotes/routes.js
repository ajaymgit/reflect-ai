import { Router } from "express";
import VoiceNote from "../../models/VoiceNote.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { validateRequest } from "../../shared/middleware/validateRequest.js";
import { createVoiceNoteSchema } from "../../shared/validators/voiceNoteSchemas.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { AppError } from "../../shared/utils/AppError.js";

const router = Router();

// Upload happens as its own step, before the chat message itself is sent --
// the client records audio, POSTs it here to get back an id, then sends the
// actual chat message referencing { id, durationSec, mimeType } (see
// chat/routes.js's POST /message). Decoupled this way so a failed/retried
// chat send never re-uploads the audio, and so any future consumer of voice
// notes (e.g. an attachment on a journal entry) doesn't need its own
// separate upload path.
router.post(
  "/",
  requireAuth,
  validateRequest(createVoiceNoteSchema),
  asyncHandler(async (req, res) => {
    const { audio, mimeType, durationSec } = req.validated.body;
    const note = await VoiceNote.create({ userId: req.user._id, audio, mimeType, durationSec });
    res.status(201).json({ id: note._id, mimeType: note.mimeType, durationSec: note.durationSec });
  }),
);

// Fetched on demand only when someone presses play on a voice-note bubble
// (see ChatPage.jsx's VoiceNotePlayer) -- not included in the normal chat
// history payload, which is what keeps GET /api/chat/session cheap even for
// a thread with dozens of voice notes in it.
router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const note = await VoiceNote.findOne({ _id: req.params.id, userId: req.user._id });
    if (!note) throw new AppError("NOT_FOUND", "Voice note not found.", 404);
    res.json({ audio: note.audio, mimeType: note.mimeType, durationSec: note.durationSec });
  }),
);

export default router;
