// Captures a small number of REAL, unedited request/response turns through
// this repository's actual chat engine -- raw model output, the evidence
// candidates it was shown, the audit log's accept/reject decision, and the
// final response -- for optional use as a qualitative appendix or artifact
// alongside the paper's quantitative results.
//
// IMPORTANT: this script writes exactly what the model and policy pipeline
// actually produced when run. It does not edit, curate, or invent any
// conversational content -- if a captured turn looks unremarkable or a
// rejection looks mundane, that is left in as-is. Nothing here should be
// hand-edited before use; if a transcript needs to be excluded, delete the
// whole entry rather than rewriting its text.
//
// Run from the server/ directory: npm run capture-transcripts
// Requires: MongoDB reachable at MONGO_URI, and a real AI provider
// configured (Ollama running locally, or OPENAI_API_KEY/GEMINI_API_KEY set)
// -- same requirements as eval-chat-engine.
//
// Writes one file into server/eval-results/:
//   example-transcripts-<timestamp>.md  -- human-readable, ready to read or
//                                          attach as supplementary material
//   example-transcripts-<timestamp>.json -- same data, machine-readable

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { env } from "../shared/config/env.js";
import JournalEntry from "../models/JournalEntry.js";
import HealthData from "../models/HealthData.js";
import ChatSession from "../models/ChatSession.js";
import AuditLog from "../models/AuditLog.js";
import { processChatTurn } from "../modules/chat/service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../eval-results");

// A distinct synthetic user id from evalChatEngine.js / evalAblation.js, so
// this script's session/audit history never mixes with either eval run.
const EVAL_USER_ID = new mongoose.Types.ObjectId("00000000000000000000ec5a");

const SEED_JOURNALS = [
  { content: "Work has been really overwhelming this week, I can't catch a break between meetings.", mood: "stressed" },
  { content: "Had a good talk with my sister today, felt a lot lighter afterward.", mood: "happy" },
  { content: "Feeling kind of disconnected from my friends lately, not sure why.", mood: "sad" },
  { content: "Went for a long walk and just thought about things, felt calm for once.", mood: "calm" },
  { content: "Keep comparing myself to people at work and it's exhausting.", mood: "stressed" },
  { content: "Grateful for my partner today, they really showed up for me.", mood: "happy" },
  { content: "Not sure what I'm doing with my career direction anymore.", mood: "reflective" },
  { content: "Got into an argument with my roommate over something small, still annoyed.", mood: "angry" },
];

function buildSeedHealth() {
  const rows = [];
  for (let i = 0; i < 9; i += 1) {
    const date = new Date(Date.now() - i * 86400000);
    rows.push({
      userId: EVAL_USER_ID,
      date,
      sleepHours: 6.5 + (i % 3) * 0.4,
      steps: 5000 + i * 300,
      stressScore: 40 + (i % 4) * 8,
      restingHeartRate: 62 + (i % 3),
      completeness: 0.95,
      confidence: 0.9,
      source: "eval-seed",
    });
  }
  return rows;
}

// Three prompts chosen to exercise visibly different situations -- not
// chosen or re-rolled after the fact for a particular outcome. Whatever the
// live model and policy gate actually decide for each is what gets written.
const SAMPLE_TURNS = [
  { text: "I keep noticing I feel worse on Sundays before the work week starts, and I always end up snapping at people I care about because I'm dreading Monday", tag: "long_reflective", mode: "deep" },
  { text: "do you think my sleep has been affecting my mood this week?", tag: "health_reference", mode: "quick" },
  { text: "hey", tag: "greeting", mode: "quick" },
];

async function seed() {
  await ChatSession.deleteOne({ userId: EVAL_USER_ID });
  await AuditLog.deleteMany({ userId: EVAL_USER_ID, triggerReason: "eval_run" });

  const existingJournals = await JournalEntry.countDocuments({ userId: EVAL_USER_ID });
  if (existingJournals === 0) {
    for (const j of SEED_JOURNALS) {
      await JournalEntry.create({ userId: EVAL_USER_ID, content: j.content, mood: j.mood });
    }
  }

  await HealthData.deleteMany({ userId: EVAL_USER_ID });
  await HealthData.insertMany(buildSeedHealth());
}

async function captureOne(promptText, tag, mode) {
  const start = process.hrtime.bigint();
  const result = await processChatTurn({
    userId: EVAL_USER_ID,
    userMessage: promptText,
    chatSettings: { mode },
  });
  const latencyMs = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
  const audit = await AuditLog.findOne({ userId: EVAL_USER_ID }).sort({ createdAt: -1 });

  return {
    tag,
    mode,
    userMessage: promptText,
    latencyMs,
    accepted: result.accepted,
    auditStatus: audit?.status || "unknown",
    policyDecisions: audit?.policyDecisions || null,
    evidenceCandidatesShown: (result.evidenceCandidates || []).map((c) => ({
      id: c.journalId,
      preview: typeof c.quote === "string" ? c.quote.slice(0, 140) : String(c.quote).slice(0, 140),
    })),
    rawModelOutput: result.rawGeneratedPayload,
    finalResponse: result.payload,
  };
}

function toMarkdown(turns, startedAt) {
  const lines = [];
  lines.push(`# Example transcripts -- ${startedAt}`);
  lines.push("");
  lines.push(
    "Each entry below is one real, unedited call through `processChatTurn` against this repository's actual " +
      "chat engine, connected to the MongoDB instance and AI provider configured in `server/.env` at the time of " +
      "the run. Nothing here has been rewritten or curated after the fact -- rejections and unremarkable turns are " +
      "left in as captured. The evaluation user was seeded with the same 8 journal entries and 9 days of " +
      "synthetic health data used by `eval-chat-engine`.",
  );
  lines.push("");
  for (const [i, t] of turns.entries()) {
    lines.push(`## Turn ${i + 1} -- ${t.tag} (${t.mode} mode)`);
    lines.push("");
    lines.push(`**User message:** ${t.userMessage}`);
    lines.push("");
    lines.push(`**Outcome:** ${t.auditStatus} (${t.latencyMs} ms)`);
    lines.push("");
    if (t.policyDecisions) {
      lines.push("**Policy decisions:**");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(t.policyDecisions, null, 2));
      lines.push("```");
      lines.push("");
    }
    lines.push(`**Evidence candidates shown to the model (${t.evidenceCandidatesShown.length}):**`);
    lines.push("");
    if (t.evidenceCandidatesShown.length) {
      for (const c of t.evidenceCandidatesShown) {
        lines.push(`- \`${c.id}\`: "${c.preview}${c.preview.length >= 140 ? "..." : ""}"`);
      }
    } else {
      lines.push("- (none)");
    }
    lines.push("");
    lines.push("**Raw model output (before policy gate):**");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(t.rawModelOutput, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("**Final response returned to the user:**");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(t.finalResponse, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  await mongoose.connect(env.MONGO_URI);
  console.log(`Connected to ${env.MONGO_URI}`);

  await seed();
  console.log("Seed data ready.");

  const startedAt = new Date().toISOString();
  const turns = [];
  for (const p of SAMPLE_TURNS) {
    process.stdout.write(`  capturing "${p.tag}" (${p.mode})... `);
    const turn = await captureOne(p.text, p.tag, p.mode);
    console.log(`${turn.auditStatus} (${turn.latencyMs}ms)`);
    turns.push(turn);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(OUT_DIR, `example-transcripts-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `example-transcripts-${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify({ startedAt, turns }, null, 2));
  fs.writeFileSync(mdPath, toMarkdown(turns, startedAt));

  console.log(`\nWritten:\n  ${jsonPath}\n  ${mdPath}`);
  console.log(
    "\nThese are optional supplementary material -- nothing in the paper currently references them. " +
      "Read the .md file before deciding whether to attach or quote from it anywhere.",
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Transcript capture failed:", err);
  process.exit(1);
});
