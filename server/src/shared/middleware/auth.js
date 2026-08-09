import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import User from "../../models/User.js";

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(new AppError("AUTH_INVALID", "Missing authentication token", 401));
  }

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    // Allow-list, not a deny-list: only an "access" token (or one signed
    // before the "type" claim existed at all, treated as access for
    // backward compatibility) may authenticate a request here. This
    // deliberately rejects every other token type by default -- refresh
    // tokens, the 2fa_pending token issued mid-login before the second
    // factor is checked, and any future single-purpose token type -- rather
    // than naming each one to block individually. A previous version of
    // this check only explicitly blocked "refresh", which meant the
    // 2fa_pending token (proving only that a password was correct, NOT that
    // 2FA was completed) could be used as a fully-privileged access token
    // and silently bypass 2FA entirely.
    if (decoded.type && decoded.type !== "access") {
      return next(new AppError("AUTH_INVALID", "Invalid authentication token", 401));
    }
    const user = await User.findById(decoded.userId).select("_id name email tokenVersion twoFactorEnabled");
    if (!user) {
      return next(new AppError("AUTH_INVALID", "Invalid authentication token", 401));
    }
    // Tokens signed before "tv" existed have no claim; treat missing on
    // either side as 0 so pre-existing sessions aren't force-logged-out by
    // this change alone -- only an explicit logout-all bumps tokenVersion.
    const tokenVersion = decoded.tv ?? 0;
    const currentVersion = user.tokenVersion ?? 0;
    if (tokenVersion !== currentVersion) {
      return next(new AppError("AUTH_INVALID", "Session expired. Please login again.", 401));
    }
    req.user = user;
    return next();
  } catch (_error) {
    return next(new AppError("TOKEN_EXPIRED", "Session expired. Please login again.", 401));
  }
}

