import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import User from "../../models/User.js";
import RefreshSession from "../../models/RefreshSession.js";
import PasswordResetToken from "../../models/PasswordResetToken.js";
import { env } from "../../shared/config/env.js";
import { validateRequest } from "../../shared/middleware/validateRequest.js";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  twoFactorVerifySchema,
  twoFactorLoginSchema,
  twoFactorDisableSchema,
  reminderPreferencesSchema,
  digestPreferencesSchema,
} from "../../shared/validators/authSchemas.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { AppError } from "../../shared/utils/AppError.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { signAccessToken, signRefreshToken } from "../../shared/utils/tokens.js";
import { sendEmail } from "../../shared/utils/mailer.js";
import {
  generateTotpSecret,
  verifyTotp,
  buildOtpauthUri,
  generateBackupCodes,
  hashBackupCode,
} from "../../shared/utils/totp.js";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function hashResetToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// Starts a brand new rotation chain for one login/register call and returns
// the refresh token for it. Each call creates its own RefreshSession
// document, so signing in on a second device never touches the first
// device's session -- each has an independent currentJti/previousJti chain.
async function issueRefreshToken(user) {
  const jti = crypto.randomUUID();
  const session = await RefreshSession.create({ userId: user._id, currentJti: jti });
  return signRefreshToken({ userId: user._id, tv: user.tokenVersion ?? 0, sid: session._id, jti });
}

// A short-lived, single-purpose token proving "this request already
// supplied the correct password for this account" -- issued by /login in
// place of real access/refresh tokens when the account has 2FA enabled, and
// only usable at POST /api/auth/2fa/login to complete the sign-in. It is
// NOT a valid access or refresh token (requireAuth and /refresh both check
// `type`), and expires quickly since it should only ever live for as long as
// it takes to type a 6-digit code.
const TWO_FACTOR_PENDING_TTL = "5m";
function signTwoFactorPendingToken(user) {
  return jwt.sign(
    { userId: user._id, tv: user.tokenVersion ?? 0, type: "2fa_pending" },
    env.JWT_SECRET,
    { expiresIn: TWO_FACTOR_PENDING_TTL },
  );
}

async function issueLoginTokens(user) {
  const token = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user);
  return {
    token,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      reminderEnabled: user.reminderEnabled ?? true,
      reminderHour: user.reminderHour ?? 20,
      weeklyDigestEnabled: user.weeklyDigestEnabled ?? false,
    },
  };
}

const router = Router();

// Fixed bcrypt hash of an unused, never-checked value. Used to give login a
// bcrypt.compare cost to pay even when no matching user exists, so that
// requests for unregistered emails take roughly the same time as requests
// for registered ones (closes a timing-based email-enumeration channel).
const DUMMY_PASSWORD_HASH = "$2a$10$bquX2kcxyKfzJyr4LA2AQeDaOwxEDe1tjSvy5/sGjFPMNsPm8xUY2";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || "").toLowerCase()}`,
  message: { code: "RATE_LIMITED", message: "Too many attempts. Try again shortly." },
});

// Defense-in-depth against distributed brute force: authLimiter above keys on
// IP+email, so an attacker spreading guesses across many IPs (a botnet, a
// proxy pool) gets a fresh 10-attempt bucket per IP against the same target
// account. This one keys on email ALONE, capping total attempts against a
// single account across every source IP combined. Looser than authLimiter
// per-IP (20 vs 10) since a legitimate user retrying a forgotten password a
// few times, possibly switching networks, shouldn't realistically hit it.
const emailLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.body?.email || "").toLowerCase() || "unknown",
  message: { code: "RATE_LIMITED", message: "Too many attempts for this account. Try again shortly." },
});

// Separate, more generous limiter for /refresh: unlike login/register this is
// called routinely by every active session (roughly once per access-token
// lifetime), including from multiple tabs/devices for the same account, so
// the strict per-email login limiter would be the wrong fit here.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { code: "RATE_LIMITED", message: "Too many refresh attempts. Try again shortly." },
});

// Keyed on IP+email like authLimiter, and deliberately strict: unlike login,
// there's no legitimate reason to request a password reset email more than a
// few times in 15 minutes, and each request costs an outbound email send.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || "").toLowerCase()}`,
  message: { code: "RATE_LIMITED", message: "Too many reset requests. Try again shortly." },
});

// A 6-digit TOTP code is only 1,000,000 possibilities -- without a tight
// limiter here an unthrottled attacker could brute-force it well within the
// 5-minute life of a twoFactorToken. Keyed on the pending token itself so
// the cap applies per login attempt regardless of how many source IPs an
// attacker spreads guesses across.
const twoFactorLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.body?.twoFactorToken || req.ip),
  message: { code: "RATE_LIMITED", message: "Too many incorrect codes. Please log in again." },
});

router.post(
  "/register",
  authLimiter,
  validateRequest(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.validated.body;
    // Hash the password BEFORE checking whether the email is taken (not
    // after), so both outcomes pay the same bcrypt cost -- otherwise a
    // "taken" response would come back measurably faster than a real
    // registration, giving an enumeration probe a timing signal on top of
    // the response itself.
    //
    // NOTE: this can only equalize timing, not fully close email
    // enumeration at registration -- a genuinely new account gets real
    // tokens back immediately (this app logs users in on register, with no
    // email-verification step), while a "this email is taken" response
    // necessarily cannot hand back tokens for an account it doesn't own.
    // That response-shape difference (tokens vs. no tokens) is
    // unavoidable without switching registration to an
    // email-verification-gated flow (create as unverified, always respond
    // "check your email," require verifying before login works) -- a
    // larger change than this fix. Login and forgot-password, by contrast,
    // CAN be made fully identical for "wrong" vs "doesn't exist" and
    // already are (see DUMMY_PASSWORD_HASH above and forgot-password below).
    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await User.findOne({ email });
    if (existing) {
      throw new AppError("AUTH_INVALID", "That email can't be used to create an account.", 409);
    }

    const user = await User.create({ name, email, passwordHash });
    const token = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user);

    res.status(201).json({
      token,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        reminderEnabled: user.reminderEnabled ?? true,
        reminderHour: user.reminderHour ?? 20,
        weeklyDigestEnabled: user.weeklyDigestEnabled ?? false,
      },
    });
  }),
);

router.post(
  "/login",
  authLimiter,
  emailLoginLimiter,
  validateRequest(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.validated.body;
    const user = await User.findOne({ email });

    // Always run bcrypt.compare, even when no user was found, against a fixed
    // dummy hash. This keeps the response time for "unknown email" requests
    // indistinguishable from "known email, wrong password" requests.
    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_PASSWORD_HASH);
    if (!user || !ok) {
      throw new AppError("AUTH_INVALID", "Invalid credentials", 401);
    }

    if (user.twoFactorEnabled) {
      // Password was correct, but don't issue real tokens yet -- hand back a
      // short-lived pending token that only proves "password verified" and
      // must be exchanged (with a valid 2FA code) at POST /api/auth/2fa/login.
      return res.json({ twoFactorRequired: true, twoFactorToken: signTwoFactorPendingToken(user) });
    }

    res.json(await issueLoginTokens(user));
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      twoFactorEnabled: !!req.user.twoFactorEnabled,
      reminderEnabled: req.user.reminderEnabled ?? true,
      reminderHour: req.user.reminderHour ?? 20,
      weeklyDigestEnabled: req.user.weeklyDigestEnabled ?? false,
    });
  }),
);

// Lets each account pick its own journaling-reminder time (or turn reminders
// off entirely) instead of one fixed time for every user. Read by
// scripts/sendJournalingReminders.js, which is meant to be run hourly (see
// that file's header comment) and only emails accounts whose reminderHour
// matches the hour it's currently running in.
router.patch(
  "/reminder-preferences",
  requireAuth,
  validateRequest(reminderPreferencesSchema),
  asyncHandler(async (req, res) => {
    const { enabled, hour } = req.body;
    await User.findByIdAndUpdate(req.user._id, { reminderEnabled: enabled, reminderHour: hour });
    res.json({ reminderEnabled: enabled, reminderHour: hour });
  }),
);

// Opt-in weekly recap email (7-day entry count, streak, dominant mood,
// health averages) -- see scripts/sendWeeklyDigest.js, meant to run once a
// week (unlike the reminder script's hourly cadence). Separate route/schema
// from reminder-preferences above rather than folding a third field into
// that one: different cadence, different opt-in default (off, not on), and
// a genuinely different concern (a recap vs a same-day nudge).
router.patch(
  "/digest-preferences",
  requireAuth,
  validateRequest(digestPreferencesSchema),
  asyncHandler(async (req, res) => {
    const { enabled } = req.body;
    await User.findByIdAndUpdate(req.user._id, { weeklyDigestEnabled: enabled });
    res.json({ weeklyDigestEnabled: enabled });
  }),
);

// Exchanges a still-valid refresh token for a fresh, short-lived access
// token AND a new refresh token (rotation): every successful call retires
// the presented refresh token and issues a new one, so a copied/leaked
// refresh token is only useful until its next legitimate use. This is what
// lets the access token be short (15m) without logging the user out every
// 15 minutes -- the client calls this transparently (see client/src/api.js)
// whenever a request comes back 401, and must persist the new refreshToken
// returned here since the old one it sent will no longer work on its own.
router.post(
  "/refresh",
  refreshLimiter,
  asyncHandler(async (req, res) => {
    const refreshToken = req.body?.refreshToken;
    if (!refreshToken || typeof refreshToken !== "string") {
      throw new AppError("AUTH_INVALID", "Missing refresh token", 401);
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, env.JWT_SECRET);
    } catch {
      throw new AppError("AUTH_INVALID", "Invalid or expired refresh token", 401);
    }

    // Reject an access token presented here as if it were a refresh token,
    // and vice versa in requireAuth -- the two must not be interchangeable.
    // Tokens signed before rotation shipped have no sid/jti; treat those as
    // invalid too rather than special-casing them, so every live session
    // naturally re-authenticates once and picks up a proper rotation chain.
    if (decoded.type !== "refresh" || !decoded.sid || !decoded.jti) {
      throw new AppError("AUTH_INVALID", "Invalid refresh token", 401);
    }

    const user = await User.findById(decoded.userId).select("_id name email tokenVersion");
    const currentVersion = user?.tokenVersion ?? 0;
    if (!user || (decoded.tv ?? 0) !== currentVersion) {
      throw new AppError("AUTH_INVALID", "Session expired. Please login again.", 401);
    }

    const session = await RefreshSession.findById(decoded.sid);
    if (!session || String(session.userId) !== String(user._id)) {
      throw new AppError("AUTH_INVALID", "Session expired. Please login again.", 401);
    }

    const now = new Date();
    const isCurrent = decoded.jti === session.currentJti;
    const isGracePrevious =
      !isCurrent &&
      decoded.jti === session.previousJti &&
      session.previousJtiExpiresAt &&
      now < session.previousJtiExpiresAt;

    if (!isCurrent && !isGracePrevious) {
      // The presented jti is neither the current token for this session nor
      // one still inside its short rotation grace window -- it's a token
      // that was already superseded and should never be seen again. That's
      // the signature of a stolen/replayed refresh token, not an innocent
      // race. Treat it as a theft signal: kill this session and, since we
      // can't know how far the compromise reached, force every session for
      // this account to re-authenticate (same effect as logout-all).
      await RefreshSession.deleteOne({ _id: session._id });
      await User.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } });
      throw new AppError("AUTH_INVALID", "Session expired. Please login again.", 401);
    }

    if (isGracePrevious) {
      // Another request already rotated this session forward (e.g. two tabs
      // refreshing around the same moment). Don't rotate again -- hand back
      // a token for the CURRENT jti so this requester converges onto the
      // same valid state instead of being left holding a token that would
      // look like reuse the next time it tries to refresh.
      const convergedRefreshToken = signRefreshToken({
        userId: user._id,
        tv: currentVersion,
        sid: session._id,
        jti: session.currentJti,
      });
      return res.json({ token: signAccessToken(user), refreshToken: convergedRefreshToken });
    }

    // Normal path: rotate. The just-used jti becomes the grace-period
    // "previous" one for a short window (absorbing benign races) and a new
    // jti becomes current.
    const newJti = crypto.randomUUID();
    const updatedSession = await RefreshSession.findByIdAndUpdate(
      session._id,
      {
        previousJti: session.currentJti,
        previousJtiExpiresAt: new Date(now.getTime() + 30 * 1000),
        currentJti: newJti,
      },
      { new: true },
    );
    const newRefreshToken = signRefreshToken({
      userId: user._id,
      tv: currentVersion,
      sid: updatedSession._id,
      jti: newJti,
    });
    res.json({ token: signAccessToken(user), refreshToken: newRefreshToken });
  }),
);

// Invalidates every token issued before this call, across every device --
// closes the "logout doesn't actually revoke anything" gap (Phase 4,
// Section: JWT replay after client-side logout). The token used to call this
// endpoint is itself invalidated too, since it also carries the pre-bump tv.
router.post(
  "/logout-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { tokenVersion: 1 } },
      { new: true },
    );
    // Not required for correctness -- /refresh already rejects every
    // outstanding refresh token via the tv check above -- but leaving dead
    // session documents around forever is unnecessary DB bloat, so clear
    // them out opportunistically.
    await RefreshSession.deleteMany({ userId: req.user._id });
    res.json({ ok: true, tokenVersion: updated.tokenVersion });
  }),
);

// Generates (or rotates) the long-lived token the Apple Health companion app
// authenticates sync requests with. Deliberately separate from the normal
// access/refresh token pair -- that pair is short-lived and tied to a login
// session, wrong shape for a background process on a phone that syncs
// without a user present to re-authenticate. The raw token is returned here
// exactly once and only its SHA-256 hash is stored (same principle as
// passwordHash/reset tokens); calling this again immediately invalidates
// whatever token was issued before, since only one hash is stored at a time.
router.post(
  "/health-sync-token",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashResetToken(rawToken);
    await User.findByIdAndUpdate(req.user._id, { healthSyncTokenHash: tokenHash });
    res.json({ token: rawToken });
  }),
);

// Always responds with the same generic message whether or not the email
// belongs to an account -- confirming/denying account existence here would
// be a user-enumeration channel (an attacker could harvest which emails
// have accounts just by watching the response). The real work only happens
// when a matching user is found; otherwise this is a no-op that still takes
// roughly the same code path/response shape.
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validateRequest(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.validated.body;
    const user = await User.findOne({ email });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      await PasswordResetToken.create({
        userId: user._id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      });

      const resetLink = `${env.CLIENT_URL}/reset-password?token=${rawToken}`;
      await sendEmail({
        to: user.email,
        subject: "Reset your ReflectAI password",
        text: `Someone requested a password reset for this account. If this was you, reset your password here (expires in 30 minutes): ${resetLink}\n\nIf you didn't request this, you can safely ignore this email -- your password will not be changed.`,
        html: `<p>Someone requested a password reset for this account.</p><p>If this was you, <a href="${resetLink}">click here to reset your password</a> (link expires in 30 minutes).</p><p>If you didn't request this, you can safely ignore this email -- your password will not be changed.</p>`,
      });
    }

    res.json({ ok: true, message: "If an account exists for that email, a reset link has been sent." });
  }),
);

// Exchanges a valid, unexpired, unused reset token for a new password.
// Deliberately mirrors logout-all's revocation behavior: resetting a
// password is exactly the situation where every OTHER existing session
// (including one an attacker who guessed/leaked the old password might
// still hold open) should be forced to re-authenticate.
router.post(
  "/reset-password",
  authLimiter,
  validateRequest(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = req.validated.body;
    const tokenHash = hashResetToken(token);
    const record = await PasswordResetToken.findOne({ tokenHash });

    const isValid = record && !record.usedAt && record.expiresAt > new Date();
    if (!isValid) {
      throw new AppError("AUTH_INVALID", "This reset link is invalid or has expired. Please request a new one.", 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // MongoDB update documents can't mix plain fields with $ operators at the
    // top level (once any key starts with $, every key must) -- passwordHash
    // has to go through $set explicitly alongside $inc, not as a bare field.
    await User.findByIdAndUpdate(record.userId, { $set: { passwordHash }, $inc: { tokenVersion: 1 } });
    await PasswordResetToken.findByIdAndUpdate(record._id, { usedAt: new Date() });
    await RefreshSession.deleteMany({ userId: record.userId });

    res.json({ ok: true, message: "Password updated. Please log in with your new password." });
  }),
);

// Starts (or restarts) 2FA enrollment: generates a fresh secret and stashes
// it as PENDING only -- it doesn't take effect until /2fa/verify proves the
// user's authenticator app can actually produce matching codes. This means
// an abandoned setup (closed tab, never scanned the code) can never
// half-enable 2FA and lock the account out.
router.post(
  "/2fa/setup",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.twoFactorEnabled) {
      throw new AppError("AUTH_INVALID", "Two-factor authentication is already enabled. Disable it first to set up a new device.", 400);
    }
    const secret = generateTotpSecret();
    await User.findByIdAndUpdate(req.user._id, { $set: { twoFactorPendingSecret: secret } });
    res.json({
      secret,
      otpauthUri: buildOtpauthUri({ secretBase32: secret, accountName: req.user.email }),
    });
  }),
);

// Confirms enrollment: the user must submit one valid code generated from
// the pending secret before it becomes their real, active 2FA secret. Also
// issues one-time backup codes here, shown to the user exactly once -- only
// their hashes are ever persisted (see hashBackupCode), matching the pattern
// already used for password reset tokens.
router.post(
  "/2fa/verify",
  requireAuth,
  validateRequest(twoFactorVerifySchema),
  asyncHandler(async (req, res) => {
    const fullUser = await User.findById(req.user._id).select("_id twoFactorPendingSecret twoFactorEnabled");
    if (!fullUser?.twoFactorPendingSecret) {
      throw new AppError("AUTH_INVALID", "No pending 2FA setup found. Start setup again.", 400);
    }
    const { token } = req.validated.body;
    if (!verifyTotp(fullUser.twoFactorPendingSecret, token)) {
      throw new AppError("AUTH_INVALID", "That code didn't match. Check your authenticator app and try again.", 400);
    }

    const backupCodes = generateBackupCodes();
    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        twoFactorEnabled: true,
        twoFactorSecret: fullUser.twoFactorPendingSecret,
        twoFactorPendingSecret: null,
        twoFactorBackupCodeHashes: backupCodes.map(hashBackupCode),
      },
    });

    res.json({ ok: true, backupCodes });
  }),
);

// Requires the current password (not just a valid session) so a stolen
// access/refresh token alone can't be used to turn off 2FA -- the same
// reasoning as requiring a password to view/change other sensitive account
// settings.
router.post(
  "/2fa/disable",
  requireAuth,
  validateRequest(twoFactorDisableSchema),
  asyncHandler(async (req, res) => {
    const fullUser = await User.findById(req.user._id).select("_id passwordHash");
    const ok = await bcrypt.compare(req.validated.body.password, fullUser.passwordHash);
    if (!ok) {
      throw new AppError("AUTH_INVALID", "Incorrect password.", 401);
    }
    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorPendingSecret: null,
        twoFactorBackupCodeHashes: [],
      },
    });
    res.json({ ok: true });
  }),
);

// Completes a login that /login deferred because the account has 2FA
// enabled. Accepts either a live 6-digit TOTP code or one of the one-time
// backup codes issued at enrollment (each backup code is consumed/removed
// the moment it's used, so a leaked backup code is only good once).
router.post(
  "/2fa/login",
  twoFactorLoginLimiter,
  validateRequest(twoFactorLoginSchema),
  asyncHandler(async (req, res) => {
    const { twoFactorToken, code } = req.validated.body;

    let decoded;
    try {
      decoded = jwt.verify(twoFactorToken, env.JWT_SECRET);
    } catch {
      throw new AppError("AUTH_INVALID", "This login attempt has expired. Please log in again.", 401);
    }
    if (decoded.type !== "2fa_pending") {
      throw new AppError("AUTH_INVALID", "Invalid login attempt.", 401);
    }

    // Same class of bug fixed in requireAuth (shared/middleware/auth.js):
    // this select() feeds into issueLoginTokens(user) below, which reads
    // user.reminderEnabled/reminderHour/weeklyDigestEnabled -- omitting them
    // here meant a 2FA login response would report default preference
    // values instead of whatever the account actually has saved, even
    // though the DB itself was never wrong.
    const user = await User.findById(decoded.userId).select(
      "_id name email tokenVersion twoFactorEnabled twoFactorSecret twoFactorBackupCodeHashes reminderEnabled reminderHour weeklyDigestEnabled",
    );
    if (!user || !user.twoFactorEnabled || (decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new AppError("AUTH_INVALID", "This login attempt has expired. Please log in again.", 401);
    }

    if (verifyTotp(user.twoFactorSecret, code)) {
      return res.json(await issueLoginTokens(user));
    }

    const submittedHash = hashBackupCode(code);
    const backupHashes = user.twoFactorBackupCodeHashes || [];
    if (backupHashes.includes(submittedHash)) {
      // Single-use: remove this specific backup code the moment it's spent.
      await User.findByIdAndUpdate(user._id, {
        $pull: { twoFactorBackupCodeHashes: submittedHash },
      });
      return res.json(await issueLoginTokens(user));
    }

    throw new AppError("AUTH_INVALID", "Incorrect code.", 401);
  }),
);

export default router;

