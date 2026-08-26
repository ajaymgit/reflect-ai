import { Router } from "express";
import ChatSession from "../../models/ChatSession.js";
import HealthData from "../../models/HealthData.js";
import JournalEntry from "../../models/JournalEntry.js";
import RetrospectAnalysis from "../../models/RetrospectAnalysis.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { visibleJournalFilter } from "../../shared/utils/visibleJournal.js";

const router = Router();

// "Download all my data" -- a trust/portability feature every major
// journaling app (Day One, Reflectly, Stoic) offers, and previously entirely
// absent here: there was no way to get your own data out of ReflectAI short
// of querying Mongo directly. Pulls every module's data for the current
// user only, relies on each model's own toJSON getters to return already-
// decrypted plaintext (the same mechanism every other route uses -- nothing
// here touches encryption directly), and excludes fields nobody exporting
// their own journal needs back (userId on every row, __v, the embedding
// vector).
router.get(
  "/all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;

    // visibleJournalFilter excludes time-capsule entries not yet due -- this
    // is the most direct instance of this bug: without the guard, "download
    // my data" would hand the user their own sealed capsule's content in the
    // export file, defeating the entire point of sealing it in the first
    // place (the promise, per the /capsules route, is "even the sender can't
    // peek early").
    const [journals, health, retrospects, chatSession] = await Promise.all([
      JournalEntry.find(visibleJournalFilter({ userId })).sort({ createdAt: 1 }),
      HealthData.find({ userId }).sort({ date: 1 }),
      RetrospectAnalysis.find({ userId }).sort({ createdAt: 1 }),
      ChatSession.findOne({ userId }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      account: { name: req.user.name, email: req.user.email },
      journalEntries: journals.map((j) => ({
        title: j.title,
        content: j.content,
        mood: j.mood,
        tags: j.tags,
        themes: j.themes,
        createdAt: j.createdAt,
      })),
      healthData: health.map((h) => ({
        date: h.date,
        sleepHours: h.sleepHours,
        steps: h.steps,
        stressScore: h.stressScore,
        restingHeartRate: h.restingHeartRate,
      })),
      retrospectAnalyses: retrospects.map((r) => ({
        summary: r.summary,
        detectedPatterns: r.detectedPatterns,
        socraticQuestion: r.socraticQuestion,
        behavioralLoops: r.behavioralLoops,
        healthCorrelation: r.healthCorrelation,
        createdAt: r.createdAt,
      })),
      chatTurns: (chatSession?.turns || []).map((t) => ({
        userMessage: t.userMessage,
        aiResponse: t.aiResponse,
        focus: t.focus,
        createdAt: t.createdAt,
      })),
    };

    // Content-Disposition prompts a real file download in the browser
    // instead of the JSON just rendering inline in the tab.
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="reflectai-export-${Date.now()}.json"`);
    res.status(200).send(JSON.stringify(payload, null, 2));
  }),
);

export default router;
