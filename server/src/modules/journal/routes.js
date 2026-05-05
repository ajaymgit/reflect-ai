import { Router } from "express";
import JournalEntry from "../../models/JournalEntry.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { validateRequest } from "../../shared/middleware/validateRequest.js";
import {
  journalEntryByIdSchema,
  quickJournalSchema,
  updateJournalEntrySchema,
} from "../../shared/validators/chatSchemas.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { AppError } from "../../shared/utils/AppError.js";

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
    res.status(201).json(entry);
  }),
);

router.get(
  "/:id",
  requireAuth,
  validateRequest(journalEntryByIdSchema),
  asyncHandler(async (req, res) => {
    const entry = await JournalEntry.findOne({
      _id: req.validated.params.id,
      userId: req.user._id,
    }).select("_id content mood createdAt updatedAt");

    if (!entry) {
      throw new AppError("NOT_FOUND", "Journal entry not found", 404);
    }

    res.json(entry);
  }),
);

router.put(
  "/:id",
  requireAuth,
  validateRequest(updateJournalEntrySchema),
  asyncHandler(async (req, res) => {
    const entry = await JournalEntry.findOneAndUpdate(
      { _id: req.validated.params.id, userId: req.user._id },
      {
        $set: {
          content: req.validated.body.content,
          mood: req.validated.body.mood,
        },
      },
      { new: true },
    ).select("_id content mood createdAt updatedAt");

    if (!entry) {
      throw new AppError("NOT_FOUND", "Journal entry not found", 404);
    }

    res.json(entry);
  }),
);

export default router;

