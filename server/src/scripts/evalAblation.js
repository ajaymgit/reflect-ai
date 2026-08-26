// Ablation study for the chat engine's policy layer -- for the paper's
// Results section. Answers the question evalChatEngine.js deliberately does
// NOT answer: not just "how often does the shipped system accept/reject a
// turn", but "what would actually happen if the specific mechanisms this
// paper claims as novel were removed".
//
// Three policy configurations are compared on the SAME real, once-generated
// model output per prompt (not three independent noisy model calls -- see
// "Method" below):
//   production        -- the shipped, current policy (ablation = {})
//   no_insight_gating -- restores the earlier, less-precise gate that
//                         required evidence/confidence on every non-fallback
//                         turn, not just ones asserting a claim (paper
//                         Section IV.E)
//   anti_patterns     -- restores BOTH removed anti-patterns together:
//                         evidence auto-fill and confidence-floor-boosting
//                         (paper Section IV.G)
//
// Method: for each prompt, processChatTurn() is called exactly ONCE against
// the real configured provider, under production policy. That call's
// returned `rawGeneratedPayload` (the model's own pre-policy output) and
// `evidenceCandidates` are then replayed through the SAME enrichPayload /
// scrubHealthReferences / verifyInsight pipeline processChatTurn uses
// internally, once per ablation configuration, entirely in-process with no
// further model calls. This holds the model output constant across all
// three conditions, so any difference in outcome is attributable to the
// policy logic alone, not to model stochasticity across separate calls.
//
// Run from the server/ directory: npm run eval-ablation
// Requires the same things evalChatEngine.js does: MongoDB reachable at
// MONGO_URI, and a real AI provider configured (Ollama running locally, or
// OPENAI_API_KEY/GEMINI_API_KEY set). Turns where generation itself failed
// (no rawGeneratedPayload -- e.g. the heuristic/no-provider path) are
// recorded but excluded from the ablation comparison, since there is no
// model output to replay for them.
//
// Writes two files into server/eval-results/:
//   chat-engine-ablation-<timestamp>.json
//   chat-engine-ablation-<timestamp>.md

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { env } from "../shared/config/env.js";
import JournalEntry from "../models/JournalEntry.js";
import HealthData from "../models/HealthData.js";
import ChatSession from "../models/ChatSession.js";
import AuditLog from "../models/AuditLog.js";
import {
  processChatTurn,
  enrichPayload,
  scrubHealthReferences,
  verifyInsight,
} from "../modules/chat/service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../eval-results");

// Deliberately a different fixed synthetic id than evalChatEngine.js's
// EVAL_USER_ID -- this script writes its own real AuditLog/ChatSession
// entries via the one production-policy call per prompt, and keeping that
// separate from the plain eval run's history avoids the two scripts'
// session-continuity state (repetition-avoidance, "recent turns") bleeding
// into each other. Never a real account, same as evalChatEngine.js.
const EVAL_USER_ID = new mongoose.Types.ObjectId("00000000000000000000ab1a");

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

// Same prompt set as evalChatEngine.js (see that file for why these
// particular ten), run once each in quick mode -- this study is about the
// policy layer's behavior, not mode-dependent generation, so one mode is
// enough to get a real, varied set of model outputs to replay.
const CORE_PROMPTS = [
  { text: "hey", tag: "greeting" },
  { text: "I feel really anxious and overwhelmed today, I don't know why", tag: "distress_signal" },
  { text: "thank you so much for listening, it actually helped", tag: "gratitude" },
  { text: "can we talk about my relationship with my family?", tag: "relationship_request" },
  { text: "work has been piling up and I can't keep up, I feel stuck and drained every single day this week", tag: "workload_deep" },
  { text: "i don't know, just not sure about anything right now", tag: "uncertain" },
  { text: "let's just talk about something else for a bit", tag: "open_chat" },
  { text: "actually, something else -- change of topic", tag: "topic_switch" },
  { text: "do you think my sleep has been affecting my mood this week?", tag: "health_reference" },
  { text: "I keep noticing I feel worse on Sundays before the work week starts, and I always end up snapping at people I care about because I'm dreading Monday", tag: "long_reflective" },
];

const CONDITIONS = [
  { key: "production", label: "Production (shipped policy)", ablation: {} },
  {
    key: "no_insight_gating",
    label: "Ablated: unconditional evidence/confidence gate",
    ablation: { requireEvidenceUnconditionally: true },
  },
  {
    key: "anti_patterns",
    label: "Ablated: evidence auto-fill + confidence-floor-boost restored",
    ablation: { autoFillEvidence: true, boostConfidenceFloor: true },
  },
];

async function seed() {
  await ChatSession.deleteOne({ userId: EVAL_USER_ID });
  await AuditLog.deleteMany({ userId: EVAL_USER_ID });

  const existingJournals = await JournalEntry.countDocuments({ userId: EVAL_USER_ID });
  if (existingJournals === 0) {
    for (const j of SEED_JOURNALS) {
      await JournalEntry.create({ userId: EVAL_USER_ID, content: j.content, mood: j.mood });
    }
  }

  await HealthData.deleteMany({ userId: EVAL_USER_ID });
  await HealthData.insertMany(buildSeedHealth());
}

// Replays a single real, already-generated model payload through one policy
// configuration -- the exact same enrich -> (conditional scrub) -> verify
// sequence processChatTurn() runs internally for the AI-generated path (see
// chat/service.js). Kept as a standalone function here (rather than adding
// yet another exported helper to service.js) since it is only ever needed by
// this ablation script, not by production code.
function replayPolicy({ rawGeneratedPayload, evidenceCandidates, healthQuality, ablation }) {
  let enriched = enrichPayload(rawGeneratedPayload, evidenceCandidates, ablation);
  const rawText = `${enriched.insight || ""} ${enriched.question || ""}`;
  if (!healthQuality.eligible && !enriched.fallback) {
    enriched = scrubHealthReferences(enriched);
  }
  const verification = verifyInsight({ payload: enriched, rawText, healthQuality, ablation });
  return {
    accepted: verification.accepted,
    decisions: verification.decisions,
    evidenceCount: enriched.evidence.length,
    confidence: enriched.confidence,
  };
}

async function runOne(promptText, tag) {
  const result = await processChatTurn({
    userId: EVAL_USER_ID,
    userMessage: promptText,
    chatSettings: { mode: "quick" },
  });

  if (!result.rawGeneratedPayload) {
    return {
      tag,
      prompt: promptText,
      replayable: false,
      note: "No raw generated payload (heuristic/no-provider/generation-failure path) -- nothing to replay across ablation conditions.",
      productionAccepted: result.accepted,
    };
  }

  const perCondition = {};
  for (const condition of CONDITIONS) {
    perCondition[condition.key] = replayPolicy({
      rawGeneratedPayload: result.rawGeneratedPayload,
      evidenceCandidates: result.evidenceCandidates,
      healthQuality: result.healthQuality,
      ablation: condition.ablation,
    });
  }

  // Sanity check: replaying with ablation={} (the "production" condition)
  // must reproduce exactly what processChatTurn already decided for real,
  // since it is running the identical logic on the identical inputs. If this
  // ever mismatches, the harness itself has a bug -- surface it loudly
  // rather than silently reporting misleading ablation deltas.
  const consistent = perCondition.production.accepted === result.accepted;

  return {
    tag,
    prompt: promptText,
    replayable: true,
    consistent,
    productionAccepted: result.accepted,
    responseSource: result.payload.source,
    conditions: perCondition,
  };
}

function summarize(runs) {
  const replayable = runs.filter((r) => r.replayable);
  const inconsistent = replayable.filter((r) => !r.consistent);

  const byCondition = {};
  for (const condition of CONDITIONS) {
    const outcomes = replayable.map((r) => r.conditions[condition.key]);
    const acceptedCount = outcomes.filter((o) => o.accepted).length;
    byCondition[condition.key] = {
      label: condition.label,
      n: outcomes.length,
      acceptedRate: outcomes.length ? acceptedCount / outcomes.length : 0,
      rejectedRate: outcomes.length ? 1 - acceptedCount / outcomes.length : 0,
    };
  }

  // The two comparisons that actually matter for the paper: what does each
  // removed/added gate change relative to production, on the identical set
  // of real model outputs.
  const flippedToRejectedByStrictGate = replayable.filter(
    (r) => r.conditions.production.accepted && !r.conditions.no_insight_gating.accepted,
  ).length;
  const flippedToAcceptedByAntiPatterns = replayable.filter(
    (r) => !r.conditions.production.accepted && r.conditions.anti_patterns.accepted,
  ).length;

  return {
    totalRuns: runs.length,
    replayableRuns: replayable.length,
    nonReplayableRuns: runs.length - replayable.length,
    harnessConsistencyCheck: {
      inconsistentCount: inconsistent.length,
      note:
        inconsistent.length === 0
          ? "OK: replaying production-policy ablation reproduced the real processChatTurn decision on every replayable turn."
          : "WARNING: production-policy replay diverged from the real processChatTurn decision on at least one turn -- see per-turn detail.",
    },
    byCondition,
    comparisons: {
      unnecessaryRejectionsPreventedByConditionalGate: {
        description:
          "Turns accepted in production that WOULD have been rejected under the earlier unconditional evidence/confidence gate (ablation: no_insight_gating). These are legitimate, evidence-free conversational turns (greetings, open-chat, etc.) that the conditional gate correctly lets through.",
        count: flippedToRejectedByStrictGate,
        rateOfReplayable: replayable.length ? flippedToRejectedByStrictGate / replayable.length : 0,
      },
      unsupportedClaimsPreventedByRemovingAntiPatterns: {
        description:
          "Turns rejected in production that WOULD have been silently accepted under the restored anti-patterns (ablation: anti_patterns) -- i.e. claims that would have shipped with auto-filled/irrelevant evidence or an artificially boosted confidence value instead of correctly falling back.",
        count: flippedToAcceptedByAntiPatterns,
        rateOfReplayable: replayable.length ? flippedToAcceptedByAntiPatterns / replayable.length : 0,
      },
    },
  };
}

function toMarkdown(summary, runs, startedAt) {
  const lines = [];
  lines.push(`# Chat engine ablation study -- ${startedAt}`);
  lines.push("");
  lines.push(
    `${summary.replayableRuns}/${summary.totalRuns} turns produced a real model output that could be replayed across all three policy conditions on identical input (see Method below). ${summary.harnessConsistencyCheck.note}`,
  );
  lines.push("");
  lines.push("## Table III -- Ablation: acceptance rate by policy configuration");
  lines.push("");
  lines.push("| Condition | n | Acceptance rate |");
  lines.push("|---|---|---|");
  for (const condition of CONDITIONS) {
    const c = summary.byCondition[condition.key];
    lines.push(`| ${c.label} | ${c.n} | ${(c.acceptedRate * 100).toFixed(1)}% |`);
  }
  lines.push("");
  lines.push("## What each mechanism actually changes (same model outputs, different policy)");
  lines.push("");
  const a = summary.comparisons.unnecessaryRejectionsPreventedByConditionalGate;
  const b = summary.comparisons.unsupportedClaimsPreventedByRemovingAntiPatterns;
  lines.push(
    `- Insight-conditional gating avoided **${a.count}/${summary.replayableRuns}** (${(a.rateOfReplayable * 100).toFixed(1)}%) unnecessary fallbacks on legitimate, evidence-free conversational turns that the earlier unconditional gate would have rejected.`,
  );
  lines.push(
    `- Removing the two anti-patterns prevented **${b.count}/${summary.replayableRuns}** (${(b.rateOfReplayable * 100).toFixed(1)}%) turns from being silently accepted with auto-filled or artificially confidence-boosted grounding that the current policy correctly falls back on instead.`,
  );
  lines.push("");
  lines.push("## Per-turn detail");
  lines.push("");
  lines.push("| Prompt tag | Replayable | Production | No-conditional-gate | Anti-patterns restored |");
  lines.push("|---|---|---|---|---|");
  for (const r of runs) {
    if (!r.replayable) {
      lines.push(`| ${r.tag} | no | ${r.productionAccepted} | - | - |`);
      continue;
    }
    lines.push(
      `| ${r.tag} | yes | ${r.conditions.production.accepted} | ${r.conditions.no_insight_gating.accepted} | ${r.conditions.anti_patterns.accepted} |`,
    );
  }
  lines.push("");
  lines.push(
    "Method: for each prompt, processChatTurn() is called exactly once against the real configured provider under " +
      "production policy. Its returned raw (pre-policy) model payload and evidence candidates are then replayed " +
      "in-process through each of the three policy configurations above -- no additional model calls -- so any " +
      "difference in outcome is attributable to the policy logic alone, not to separate, independently-stochastic " +
      "model calls. This is a single-run engineering ablation on a fixed prompt set, not a statistical study -- " +
      "see the paper's Limitations section.",
  );
  return lines.join("\n");
}

async function main() {
  await mongoose.connect(env.MONGO_URI);
  console.log(`Connected to ${env.MONGO_URI}`);

  await seed();
  console.log("Seed data ready.");

  const runs = [];
  let count = 0;
  const startedAt = new Date().toISOString();

  for (const p of CORE_PROMPTS) {
    count += 1;
    process.stdout.write(`  [${count}] ${p.tag}... `);
    const outcome = await runOne(p.text, p.tag);
    console.log(
      outcome.replayable
        ? `production=${outcome.conditions.production.accepted} no_gate=${outcome.conditions.no_insight_gating.accepted} anti_patterns=${outcome.conditions.anti_patterns.accepted}`
        : "not replayable (no raw model output)",
    );
    runs.push(outcome);
  }

  const summary = summarize(runs);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(OUT_DIR, `chat-engine-ablation-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `chat-engine-ablation-${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify({ startedAt, summary, runs }, null, 2));
  fs.writeFileSync(mdPath, toMarkdown(summary, runs, startedAt));

  console.log("\n=== Summary ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWritten:\n  ${jsonPath}\n  ${mdPath}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Ablation run failed:", err);
  process.exit(1);
});
