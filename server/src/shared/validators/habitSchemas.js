import { z } from "zod";

export const createHabitSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(120),
    icon: z.string().trim().max(40).optional(),
    color: z.string().trim().max(40).optional(),
    targetPerWeek: z.coerce.number().int().min(1).max(7).optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const updateHabitSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      icon: z.string().trim().max(40).optional(),
      color: z.string().trim().max(40).optional(),
      targetPerWeek: z.coerce.number().int().min(1).max(7).optional(),
      archived: z.coerce.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required." }),
  params: z.object({ id: z.string().min(1) }),
  query: z.object({}).optional(),
});

export const toggleHabitLogSchema = z.object({
  body: z.object({
    // YYYY-MM-DD -- defaults to today (server-side) when omitted, same
    // convention as manualHealthEntrySchema.
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  params: z.object({ id: z.string().min(1) }),
  query: z.object({}).optional(),
});
