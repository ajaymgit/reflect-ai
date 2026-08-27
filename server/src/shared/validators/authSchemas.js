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
    // Honeypot -- a field real users never see or fill in (rendered
    // visually hidden + tabindex="-1" on the client, see RegisterPage.jsx),
    // so anything non-empty here is almost certainly a bot filling in every
    // field it finds in the form's HTML. Optional so requests that omit it
    // entirely (any API client that isn't the current web form) still pass;
    // the route itself checks that when present, it's blank.
    website: z.string().max(0, "Bot check failed").optional(),
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

// Same shape as twoFactorDisableSchema (just a password) -- deleting an
// account is at least as consequential as turning off 2FA, so it gets the
// same "prove you still have the password, not just a live session token"
// gate. See DELETE /api/auth/account below.
export const deleteAccountSchema = z.object({
  body: z.object({
    password: z.string().min(1),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const reminderPreferencesSchema = z.object({
  body: z.object({
    enabled: z.boolean(),
    hour: z.number().int().min(0).max(23),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const digestPreferencesSchema = z.object({
  body: z.object({
    enabled: z.boolean(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

