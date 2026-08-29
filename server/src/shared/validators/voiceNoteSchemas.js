import { z } from "zod";

// Capped at 3 minutes and ~8M base64 characters (~6MB) -- generous for a
// spoken voice note (even at a low bitrate, a few minutes of speech rarely
// exceeds a couple MB), while keeping any single note nowhere near
// MongoDB's 16MB per-document ceiling and keeping the request body
// reasonable given index.js's global JSON body limit.
export const createVoiceNoteSchema = z.object({
  body: z.object({
    audio: z.string().min(1).max(8_000_000),
    mimeType: z.string().min(1).max(100),
    durationSec: z.coerce.number().min(0.3).max(180),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});
