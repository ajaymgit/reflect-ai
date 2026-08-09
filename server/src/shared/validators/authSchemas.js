import { z } from "zod";

// Normalizes email the same way on every route that accepts one, so a
// lookup always matches what User.js's schema-level `lowercase: true`
// actually stored — without this, "Nina@Example.com" at login would never
// match the lowercased "nina@example.com" saved at registration.
const emailField = z
  .string()
  .email()
  .transform((value) => value.trim().toLowerCase());

// Each check previously had no custom message, so a failing .regex() fell
// back to Zod's default -- literally the string "Invalid" -- which is what
// showed up in the UI with zero indication of which rule the password
// actually broke (missing an uppercase letter, a digit, etc).
const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: emailField,
    password: passwordField,
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const loginSchema = z.object({
  body: z.object({
    email: emailField,
    password: z.string().min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailField,
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1),
    password: passwordField,
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const twoFactorVerifySchema = z.object({
  body: z.object({
    token: z.string().min(6).max(8),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const twoFactorLoginSchema = z.object({
  body: z.object({
    twoFactorToken: z.string().min(1),
    code: z.string().min(6).max(11), // 6-digit TOTP, or an "xxxxx-xxxxx" backup code
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const twoFactorDisableSchema = z.object({
  body: z.object({
    password: z.string().min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

