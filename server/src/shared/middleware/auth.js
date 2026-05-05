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
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    const user = await User.findById(decoded.userId).select("_id name email");
    if (!user) {
      return next(new AppError("AUTH_INVALID", "Invalid authentication token", 401));
    }
    req.user = user;
    return next();
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      return next(new AppError("TOKEN_EXPIRED", "Session expired. Please login again.", 401));
    }
    return next(new AppError("AUTH_INVALID", "Invalid authentication token", 401));
  }
}

