import { z } from "zod";

// Backs the manual "Log today's health data" form on HealthPage -- the only
// way HealthData rows were ever created before this was the Apple Health
// companion app's POST /api/health-data/sync (auth'd by a long-lived sync
// token, not a normal session). Anyone without that companion app connected
// -- which is most people trying the web app on its own -- had literally no
// way to put a number into steps/sleep/heart rate, so Dashboard's wellness
// score and Health's whole page stayed permanently empty. At least one of
// the three real metrics is required; a submission with none of them isn't
// a health reading.
export const manualHealthEntrySchema = z.object({
  body: z
    .object({
      date: z.coerce.date().optional(),
      steps: z.coerce.number().min(0).max(200000).optional(),
      sleepHours: z.coerce.number().min(0).max(24).optional(),
      restingHeartRate: z.coerce.number().min(20).max(220).optional(),
    })
    .refine((v) => v.steps !== undefined || v.sleepHours !== undefined || v.restingHeartRate !== undefined, {
      message: "At least one of steps, sleepHours, or restingHeartRate is required.",
    }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});
