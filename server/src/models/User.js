import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // Per-user journaling reminder preference (see
    // scripts/sendJournalingReminders.js and PATCH /api/auth/reminder-
    // preferences). reminderHour is a 0-23 local hour, matched against
    // the server's local time when the reminder script runs -- there's no
    // per-user timezone stored, so this assumes the user and server are in
    // the same timezone, which is fine for this project's scope (a single
    // person's own local deployment) but wouldn't generalize to a multi-
    // timezone production userbase without adding one.
    reminderEnabled: { type: Boolean, default: true },
    reminderHour: { type: Number, default: 20, min: 0, max: 23 },
    // Incremented by POST /api/auth/logout-all to invalidate every JWT issued
    // before that point (embedded in each token's "tv" claim and checked in
    // requireAuth). Tokens signed before this field existed have no "tv"
    // claim; both sides are treated as 0 in that case so existing sessions
    // keep working until the user explicitly logs out everywhere.
    tokenVersion: { type: Number, default: 0 },
    // Two-factor authentication (TOTP). twoFactorSecret is only set once 2FA
    // is confirmed enabled (see /api/auth/2fa/verify) -- a secret generated
    // by /2fa/setup but never confirmed lives only in twoFactorPendingSecret
    // so an abandoned setup attempt can't half-enable 2FA.
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, default: null },
    twoFactorPendingSecret: { type: String, default: null },
    // SHA-256 hashes only, same principle as passwordHash/reset tokens --
    // the raw one-time backup codes are shown to the user exactly once at
    // enrollment and never stored.
    twoFactorBackupCodeHashes: [{ type: String }],
    // Long-lived machine-to-machine token for the Apple Health companion app
    // (see /api/auth/health-sync-token and /api/health-data/sync) -- SHA-256
    // hash only, same principle as passwordHash/reset tokens. The raw token
    // is shown to the user exactly once when generated and never stored.
    // Regenerating replaces this hash, which immediately invalidates any
    // previously issued token (only one can be active at a time).
    healthSyncTokenHash: { type: String, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema);

