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

// "New chat" -- clears the visible thread and the memory context/journal
// evidence future turns can draw on (chatSettings.useMemory reads this same
// turns array server-side in service.js), rather than just resetting client
// state and leaving the old thread to reappear on next load. Deliberately a
// real delete of the turns array, not a soft "archived" flag -- there's
// nowhere in the app a past chat session is ever browsed back through the
// way journal entries are, so there's no value in keeping it around.
router.delete(
  "/session",
  requireAuth,
  asyncHandler(async (req, res) => {
    await ChatSession.updateOne({ userId: req.user._id }, { $set: { turns: [] } }, { upsert: true });
    res.json({ ok: true });
  }),
);

export default router;

