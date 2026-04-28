import { Router } from "express";
import JournalEntry from "../../models/JournalEntry.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { validateRequest } from "../../shared/middleware/validateRequest.js";
import { quickJournalSchema } from "../../shared/validators/chatSchemas.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { refreshHypothesesForUser } from "../hypotheses/service.js";

const router = Router();

router.get(
  "/recent",
  requireAuth,
  asyncHandler(async (req, res) => {
    const entries = await JournalEntry.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .select("_id content mood createdAt");
    res.json({ entries });
  }),
);

router.post(
  "/quick-entry",
  requireAuth,
  validateRequest(quickJournalSchema),
  asyncHandler(async (req, res) => {
    const entry = await JournalEntry.create({
      userId: req.user._id,
      content: req.validated.body.content,
      mood: req.validated.body.mood,
    });
    const hypothesisSummary = await refreshHypothesesForUser(req.user._id);
    res.status(201).json({ ...entry.toObject(), hypothesisSummary });
  }),
);

export default router;

