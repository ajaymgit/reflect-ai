import { z } from "zod";

export const chatMessageSchema = z.object({
  body: z.object({
    message: z.string().min(1).max(5000),
    settings: z
      .object({
        mode: z.enum(["quick", "deep", "analysis"]).optional(),
        responseStyle: z.number().min(0).max(100).optional(),
        useMemory: z.boolean().optional(),
      })
      .optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const quickJournalSchema = z.object({
  body: z.object({
    content: z.string().min(1).max(10000),
    mood: z.enum(["happy", "calm", "reflective", "sad", "stressed", "angry"]),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

