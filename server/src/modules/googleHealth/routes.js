import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../../models/User.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { env } from "../../shared/config/env.js";
import { logError } from "../../shared/utils/logger.js";
import * as googleHealth from "./service.js";

const router = Router();
const STATE_TTL = "10m";

// Whether "Connect Google Health" should even be offered -- lets Settings
// hide the whole section instead of showing a button that would 500 on
// click when GOOGLE_HEALTH_CLIENT_ID/SECRET/REDIRECT_URI aren't configured
// (see env.js). Also reports this account's own connection state so
// Settings doesn't need a second round-trip after the page loads.
router.get(
  "/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      available: googleHealth.isConfigured(),
      connected: Boolean(req.user.googleHealthConnectedAt),
      connectedAt: req.user.googleHealthConnectedAt || null,
      needsReconnect: Boolean(req.user.googleHealthNeedsReconnect),
    });
  }),
);

// Starts the OAuth flow. Returns the Google consent URL as JSON rather than
// issuing a 302 itself -- a plain browser navigation (window.location.href)
// can't carry this app's own Authorization: Bearer header, so this has to
// stay a normal authenticated fetch() call; the client is the one that does
// the actual full-page navigation once it has the URL back (see
// GoogleHealthSection in SettingsPage.jsx).
router.get(
  "/connect",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!googleHealth.isConfigured()) {
      return res.status(503).json({ code: "NOT_CONFIGURED", message: "Google Health integration isn't configured on this server yet." });
    }
    const state = jwt.sign({ userId: req.user._id, type: "google_health_state" }, env.JWT_SECRET, {
      expiresIn: STATE_TTL,
    });
    res.json({ url: googleHealth.buildAuthorizationUrl(state) });
  }),
);

// Google redirects here after the user consents (or declines). Deliberately
// NOT behind requireAuth -- this request comes from the user's browser
// following Google's redirect, not from this app's own client carrying a
// normal session JWT, so there's no Authorization header to check. The
// signed `state` value (see /connect above) is what proves which account
// this belongs to and that it genuinely originated from this server's own
// /connect redirect a few minutes ago, not a forged callback hitting this
// URL directly.
router.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const { code, state, error: googleError } = req.query;
    const redirectBack = (query) => res.redirect(`${env.CLIENT_URL}/settings?${new URLSearchParams(query).toString()}`);

    if (googleError) {
      // User clicked "Cancel" on Google's consent screen, or another
      // declined/denied outcome -- a normal, expected path, not a bug.
      return redirectBack({ googleHealth: "declined" });
    }
    if (!code || !state) {
      return redirectBack({ googleHealth: "error" });
    }

    let payload;
    try {
      payload = jwt.verify(state, env.JWT_SECRET);
    } catch {
      return redirectBack({ googleHealth: "error" });
    }
    if (payload?.type !== "google_health_state" || !payload?.userId) {
      return redirectBack({ googleHealth: "error" });
    }

    try {
      await googleHealth.connectUser(payload.userId, code);
    } catch (error) {
      logError("Google Health connect failed", { userId: payload.userId, error: error?.message || String(error) });
      return redirectBack({ googleHealth: "error" });
    }

    redirectBack({ googleHealth: "connected" });
  }),
);

router.post(
  "/disconnect",
  requireAuth,
  asyncHandler(async (req, res) => {
    await googleHealth.disconnectUser(req.user._id);
    res.json({ ok: true });
  }),
);

// Manual sync for the account making the request -- lets someone see their
// data show up immediately after connecting instead of waiting for the next
// scheduled run of scripts/syncGoogleHealth.js (see that script's own header
// comment for why the schedule itself isn't wired up yet). Re-fetches the
// user fresh rather than trusting req.user, since getAccessToken() may have
// just flipped googleHealthNeedsReconnect on a stale in-memory copy.
router.post(
  "/sync-now",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select("googleHealthRefreshToken googleHealthNeedsReconnect");
    if (!user?.googleHealthRefreshToken) {
      return res.status(400).json({ code: "NOT_CONNECTED", message: "Connect Google Health first." });
    }
    const results = await googleHealth.syncUserRecent(user);
    const syncedDays = results.filter((r) => r.synced).length;
    res.json({ ok: true, syncedDays, results });
  }),
);

export default router;
