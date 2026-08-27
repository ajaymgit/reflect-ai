import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// Short-lived access token (was a single 7-day token before -- a stolen
// token stayed valid for up to a week with no way to revoke it mid-flight,
// even after the tokenVersion/logout-all mechanism was added). Paired with a
// long-lived refresh token so the client can stay transparently signed in
// without the user noticing, while the actual bearer credential used on
// every request is only ever valid for a few minutes.
export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL = "30d";

// sid is optional and purely informational here (unlike on the refresh
// token, requireAuth does NOT use it to authorize the request -- tokenVersion
// alone still decides whether an access token is valid, exactly as before).
// It's threaded through so GET /api/auth/sessions can tell "this is the
// device you're looking at it from right now" apart from every other active
// session, without the client having to decode its own JWT to find out.
export function signAccessToken(user, { sid } = {}) {
  const payload = { userId: user._id, tv: user.tokenVersion ?? 0, type: "access" };
  if (sid) payload.sid = String(sid);
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

// Refresh tokens carry a "sid" (the RefreshSession document tracking this
// particular login's rotation chain) and a "jti" (this specific token's own
// id within that chain). Both are required for rotation-with-reuse-detection
// in POST /api/auth/refresh (see server/src/modules/auth/routes.js) -- sid
// identifies which device/session a token belongs to (so devices don't
// interfere with each other), jti identifies which token in that session's
// history this one is, so a rotated-out token being replayed can be told
// apart from the current one.
export function signRefreshToken({ userId, tv, sid, jti }) {
  return jwt.sign(
    { userId, tv: tv ?? 0, type: "refresh", sid: String(sid), jti },
    env.JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL },
  );
}
