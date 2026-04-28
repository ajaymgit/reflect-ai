import { Router } from "express";
import { requireAuth } from "../../shared/middleware/auth.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import {
  getHypothesisSummary,
  refreshHypothesesForUser,
} from "./service.js";

const router = Router();

router.get(
  "/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    const summary = await getHypothesisSummary(req.user._id);
    res.json(summary);
  }),
);

router.post(
  "/refresh",
  requireAuth,
  asyncHandler(async (req, res) => {
    const summary = await refreshHypothesesForUser(req.user._id);
    res.json(summary);
  }),
);

export default router;
