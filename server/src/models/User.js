import mongoose from "mongoose";
import { encryptField } from "../shared/utils/encryption.js";

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
    // Opt-IN (default false, unlike reminderEnabled's opt-out default) --
    // a weekly summary email is a bigger inbox commitment than a daily
    // nudge, so nobody gets signed up for it without explicitly turning it
    // on in Settings. See PATCH /api/auth/digest-preferences and
    // scripts/sendWeeklyDigest.js (meant to run once a week, e.g. Monday
    // morning, unlike the reminder script's hourly cadence).
    weeklyDigestEnabled: { type: Boolean, default: false },
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
    // Google Health API (Fitbit/Pixel Watch) -- see
    // server/src/modules/googleHealth/. Unlike healthSyncTokenHash above,
    // this genuinely needs to be read back later (it's handed to Google's
    // token endpoint to mint fresh access tokens on the server's behalf),
    // so it's reversibly encrypted with the same AES-256-GCM field-level
    // encryption used for journal content/health metrics -- not hashed.
    // Deliberately NOT given a getter here (unlike JournalEntry/HealthData's
    // encrypted fields): every existing place that sends a User back to the
    // client already hand-picks an explicit allowlist of fields (see
    // issueLoginTokens in auth/routes.js) rather than serializing the whole
    // document, so a getter isn't needed for the app to work -- and skipping
    // it means there's no toJSON path that could ever accidentally include a
    // decrypted refresh token in a response by omission. googleHealth/
    // service.js calls decryptField/encryptField on this directly.
    googleHealthRefreshToken: { type: String, default: null, set: encryptField },
    googleHealthConnectedAt: { type: Date, default: null },
    // Flips true when Google rejects the stored refresh token (revoked by
    // the user from their Google Account, or expired from 6 months of
    // disuse) -- see googleHealth/service.js's getAccessToken. Settings
    // shows a "Needs reconnecting" state instead of silently failing every
    // sync forever.
    googleHealthNeedsReconnect: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema);

