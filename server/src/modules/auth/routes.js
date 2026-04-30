import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import User from "../../models/User.js";
import { env } from "../../shared/config/env.js";
import { validateRequest } from "../../shared/middleware/validateRequest.js";
import { loginSchema, registerSchema } from "../../shared/validators/authSchemas.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { AppError } from "../../shared/utils/AppError.js";
import { requireAuth } from "../../shared/middleware/auth.js";

const router = Router();
const isProduction = process.env.NODE_ENV === "production";
const authWindowMinutes = Number(env.AUTH_RATE_WINDOW_MINUTES ?? 10);
const authWindowMs = (Number.isFinite(authWindowMinutes) && authWindowMinutes > 0 ? authWindowMinutes : 10) * 60 * 1000;
const loginRateMax = Number(env.AUTH_LOGIN_RATE_MAX ?? (isProduction ? 120 : 200));
const registerRateMax = Number(env.AUTH_REGISTER_RATE_MAX ?? (isProduction ? 30 : 50));
const loginLimiter = rateLimit({
  windowMs: authWindowMs,
  max: Number.isFinite(loginRateMax) && loginRateMax > 0 ? loginRateMax : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: "RATE_LIMITED",
    message: "Too many login attempts. Please try again shortly.",
  },
});
const registerLimiter = rateLimit({
  windowMs: authWindowMs,
  max: Number.isFinite(registerRateMax) && registerRateMax > 0 ? registerRateMax : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: "RATE_LIMITED",
    message: "Too many registration attempts. Please try again shortly.",
  },
});

function signAccessToken(userId) {
  return jwt.sign({ userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    algorithm: "HS256",
  });
}

router.post(
  "/register",
  registerLimiter,
  validateRequest(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.validated.body;
    const existing = await User.findOne({ email });
    if (existing) {
      throw new AppError("AUTH_INVALID", "Email already exists", 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash });
    const token = signAccessToken(user._id);

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  }),
);

router.post(
  "/login",
  loginLimiter,
  validateRequest(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.validated.body;
    const user = await User.findOne({ email });
    if (!user) {
      throw new AppError("AUTH_INVALID", "Invalid credentials", 401);
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new AppError("AUTH_INVALID", "Invalid credentials", 401);
    }

    const token = signAccessToken(user._id);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ id: req.user._id, name: req.user.name, email: req.user.email });
  }),
);

export default router;

