import { z } from "zod";

export const chatMessageSchema = z.object({
  body: z.object({
    message: z.string().min(1).max(5000),
    settings: z
      .object({
        mode: z.enum(["quick", "deep", "analysis"]).optional(),
        responseStyle: z.number().min(0).max(100).optional(),
        useMemory: z.boolean().optional(),
        persona: z.enum(["gentle", "stoic", "cbt"]).optional(),
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
    title: z.string().max(200).optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    // Zod strips unrecognized keys from an object schema by default -- this
    // has to be listed explicitly or the client's "save as a Keepsake"
    // checkbox would silently never reach the server (the same class of bug
    // already hit once with chat's `persona` field).
    isKeepsake: z.boolean().optional(),
    // Time capsule reveal date -- optional, coerced from the ISO string the
    // client sends. The route itself still re-checks this is actually in
    // the future (see journal/routes.js) rather than trusting the client's
    // own validation not to have been bypassed.
    revealAt: z.coerce.date().optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

