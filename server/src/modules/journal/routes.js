import { Router } from "express";
import JournalEntry from "../../models/JournalEntry.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { validateRequest } from "../../shared/middleware/validateRequest.js";
import { quickJournalSchema } from "../../shared/validators/chatSchemas.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { extractThemes } from "../../shared/utils/extractThemes.js";

const router = Router();

router.get(
  "/recent",
  requireAuth,
  asyncHandler(async (req, res) => {
    const entries = await JournalEntry.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .select("_id content mood title tags createdAt");
    res.json({ entries });
  }),
);

// Backs the Dashboard mood-calendar heatmap and the Health/Retrospect chart
// "click a day to see what you wrote" drill-down -- both need to look up
// whatever journal entry exists for one specific calendar day. If someone
// wrote more than once that day, the most recent entry wins (same
// most-recent-entry convention /dashboard/summary already uses for
// "todaysMood").
router.get(
  "/by-date",
  requireAuth,
  asyncHandler(async (req, res) => {
    const raw = String(req.query.date || "");
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      return res.json({ entry: null });
    }
    const dayStart = new Date(parsed);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const entry = await JournalEntry.findOne({
      userId: req.user._id,
      createdAt: { $gte: dayStart, $lt: dayEnd },
    })
      .sort({ createdAt: -1 })
      .select("_id content mood title tags createdAt");
    res.json({ entry });
  }),
);

router.post(
  "/quick-entry",
  requireAuth,
  validateRequest(quickJournalSchema),
  asyncHandler(async (req, res) => {
    // Previously this route never set `themes` at all, so recurringThemes on
    // the Retrospect page could never be non-empty for any entry created
    // through the real app (only server/src/seed.js's demo data ever
    // populated it). This computes real, deterministic keywords from the
    // entry's own content -- no AI call, no new dependency.
    const entry = await JournalEntry.create({
      userId: req.user._id,
      content: req.validated.body.content,
      mood: req.validated.body.mood,
      title: req.validated.body.title || "",
      tags: req.validated.body.tags || [],
      themes: extractThemes(req.validated.body.content),
    });
    res.status(201).json(entry);
  }),
);

export default router;

