import { Router } from "express";
import rateLimit from "express-rate-limit";
import ChatSession from "../../models/ChatSession.js";
import { policyConfig } from "../../shared/config/env.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { validateRequest } from "../../shared/middleware/validateRequest.js";
import { chatMessageSchema } from "../../shared/validators/chatSchemas.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { processChatTurn } from "./service.js";

const router = Router();

const chatLimiter = rateLimit({
  windowMs: policyConfig.chatRateLimit.windowMs,
  max: policyConfig.chatRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: {
    code: "RATE_LIMITED",
    message: "Too many chat requests. Try again shortly.",
  },
});

router.post(
  "/message",
  requireAuth,
  chatLimiter,
  validateRequest(chatMessageSchema),
  asyncHandler(async (req, res) => {
    const result = await processChatTurn({
      userId: req.user._id,
      userMessage: req.validated.body.message,
      chatSettings: req.validated.body.settings || {},
    });

    res.json(result);
  }),
);

router.get(
  "/session",
  requireAuth,
  asyncHandler(async (req, res) => {
    const session = await ChatSession.findOne({ userId: req.user._id });
    res.json({ turns: session?.turns || [] });
  }),
);

export default router;

