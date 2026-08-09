import crypto from "node:crypto";
import { AppError } from "../utils/AppError.js";
import User from "../../models/User.js";

// Separate from requireAuth (which validates short-lived JWTs tied to a
// login session) -- the Apple Health companion app runs in the background on
// a phone with nobody present to re-authenticate, so it needs a long-lived,
// revocable-by-regeneration credential instead. Same hashing principle as
// passwordHash/reset tokens: only a SHA-256 hash is ever stored, so a leaked
// database dump doesn't hand over usable sync tokens.
export async function requireHealthSyncToken(req, _res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(new AppError("AUTH_INVALID", "Missing health sync token", 401));
  }
  const rawToken = header.split(" ")[1];
  if (!rawToken) {
    return next(new AppError("AUTH_INVALID", "Missing health sync token", 401));
  }
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const user = await User.findOne({ healthSyncTokenHash: tokenHash }).select("_id");
  if (!user) {
    return next(new AppError("AUTH_INVALID", "Invalid or revoked health sync token", 401));
  }
  req.user = user;
  return next();
}
