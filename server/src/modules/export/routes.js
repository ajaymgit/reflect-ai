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

// CSV-formatted companion to /all, journal entries only -- the JSON export
// above is the complete, structured "everything" download, but a raw JSON
// blob isn't something most people can actually open and skim; a plain
// spreadsheet-importable CSV of just the entries (the data someone doing
// "let me look back through what I wrote" actually wants) is a friendlier
// second option, not a replacement.
function csvEscape(value) {
  const str = String(value ?? "");
  // Quote-and-double-up any field containing a comma, quote, or newline --
  // the standard CSV escaping rule (RFC 4180). Every field gets wrapped
  // regardless, simpler and still fully valid than only quoting when
  // "necessary".
  return `"${str.replace(/"/g, '""')}"`;
}

router.get(
  "/journal.csv",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Same visibility guard as /all -- a sealed time capsule stays out of
    // this export too, for the same reason.
    const journals = await JournalEntry.find(visibleJournalFilter({ userId: req.user._id })).sort({
      createdAt: 1,
    });

    const header = ["Date", "Title", "Mood", "Tags", "Content"].map(csvEscape).join(",");
    const rows = journals.map((j) =>
      [
        new Date(j.createdAt).toISOString().slice(0, 10),
        j.title || "",
        j.mood,
        (j.tags || []).join("; "),
        j.content,
      ]
        .map(csvEscape)
        .join(","),
    );
    // \r\n line endings (not just \n) -- the CSV spec's own recommended
    // terminator, and what makes Excel on Windows treat this as one row per
    // line reliably rather than occasionally mis-parsing bare \n exports.
    const csv = [header, ...rows].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="reflectai-journal-${Date.now()}.csv"`);
    // A leading UTF-8 BOM so Excel (which otherwise guesses an unlabeled
    // CSV's encoding as the system locale's default, mangling any non-ASCII
    // character someone actually wrote) opens this as UTF-8 correctly.
    res.status(200).send(`﻿${csv}`);
  }),
);

export default router;
