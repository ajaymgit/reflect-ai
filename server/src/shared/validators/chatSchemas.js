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

// PATCH /api/journal/:id -- editing an already-saved entry. Every field is
// optional (someone might only be fixing a typo in the title, or just
// correcting the mood they picked in the moment) but at least one has to be
// present, or this is a no-op request that shouldn't hit the database at
// all. Deliberately excludes revealAt (a time capsule's reveal date is a
// one-time commitment made at write time, see JournalEntry.js) and
// themes/embedding (both are always recomputed server-side from `content`
// in the route itself, see journal/routes.js, so they can never be set
// directly here and drift out of sync with a hand-edited value).
export const updateJournalSchema = z.object({
  body: z
    .object({
      content: z.string().min(1).max(10000).optional(),
      mood: z.enum(["happy", "calm", "reflective", "sad", "stressed", "angry"]).optional(),
      title: z.string().max(200).optional(),
      tags: z.array(z.string().min(1).max(40)).max(20).optional(),
      isKeepsake: z.boolean().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: "Provide at least one field to update.",
    }),
  params: z.object({ id: z.string().min(1) }),
  query: z.object({}).optional(),
});

