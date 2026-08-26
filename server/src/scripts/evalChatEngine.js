// Real end-to-end evaluation harness for the chat engine -- produces the
// actual numbers for the paper's Results table (response acceptance rate,
// rejection rate, latency, response-source breakdown), instead of numbers
// that were never measured.
//
// Deliberately NOT part of the Vitest suite (service.test.js): that suite
// runs against mongodb-memory-server with USE_OLLAMA=false and no API keys,
// specifically to test the *validation/gating logic* in isolation, fast and
// offline. This script does the opposite on purpose -- it connects to your
// REAL MongoDB (whatever MONGO_URI is in server/.env) and calls through to
// whatever real AI provider your .env actually has configured (Ollama,
// Gemini, or OpenAI), because the whole point here is to measure real model
// behavior, not the deterministic heuristic path.
//
// Run from the server/ directory: npm run eval-chat-engine
// Optionally repeat the whole prompt set N times to report run-to-run
// variance instead of a single-run point estimate (addresses the paper's
// stated single-run limitation -- see Section VII):
//   EVAL_REPEATS=5 npm run eval-chat-engine
// Defaults to 1 (the original single-run behavior) when unset.
// Requires: MongoDB reachable at MONGO_URI, and a real AI provider
// configured (Ollama running locally, or OPENAI_API_KEY/GEMINI_API_KEY set).
//
// PROMPT SET: 50 distinct prompts (up from the original 10), each with one
// designated mode (25 quick / 13 deep / 12 analysis -- roughly the same
// 50/25/25 split as the original run) so Table II's mode-wise breakdown
// still comes out of summarize()'s existing byMode grouping with no other
// code changes. All 10 original prompts/tags are preserved verbatim inside
// the new set for continuity with the previously reported numbers.
// For a pooled n=500 (the size used for the paper's confidence interval),
// run:
//   EVAL_REPEATS=10 npm run eval-chat-engine
// (50 prompts x 10 repeats = 500 turns.)
//
// Writes two files into server/eval-results/:
//   chat-engine-eval-<timestamp>.json   -- full per-turn data, for the record
//   chat-engine-eval-<timestamp>.md     -- a Markdown table, paste straight
//                                          into the paper's Results section
//
// IMPORTANT: this hits a real AI provider for every prompt below. If you're
// on a paid API plan, that has a real (small) cost. Uses your own account
// either way -- nothing here talks to Anthropic or any third party besides
// whatever provider your own .env already points at.

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

// A fixed, clearly-labeled synthetic user for evaluation runs -- never a
// real account. Re-running the script re-uses the same id (idempotent
// journal/health seeding, fresh chat session) rather than piling up a new
// throwaway user every run.
const EVAL_USER_ID = new mongoose.Types.ObjectId("00000000000000000000eea1");

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

// >= policyConfig.minHealthDays (7), complete/confident, so the eval run
// also exercises the health-eligible branch of the prompt with a real model
// instead of only the ineligible/scrubbed path.
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

// A deliberately varied prompt set spanning the intent space the heuristic
// engine and the model prompt both explicitly handle (see detectIntent /
// the "Rules" section of the model prompt in chat/service.js) -- greeting,
// distress, gratitude, relationship, workload, uncertainty, an open-chat
// request, a topic switch, health-referencing messages, longer reflective
// messages meant to score high on scoreMessageDepth(), and (new in the
// 50-prompt set) grief, burnout, boundary-setting, goal-setting, conflict,
// financial and career stress, celebration, and pattern-recognition
// requests. Each prompt carries its own designated mode rather than being
// re-run across all three modes, so summarize()'s existing byMode grouping
// produces Table II directly. The original 10 prompts/tags are kept
// verbatim below (marked ORIGINAL) for continuity with prior runs.
const PROMPTS = [
  // -- quick (25) --
  { text: "hey", tag: "greeting", mode: "quick" }, // ORIGINAL
  { text: "good morning", tag: "morning_checkin", mode: "quick" },
  { text: "how's it going", tag: "casual_checkin", mode: "quick" },
  { text: "thank you so much for listening, it actually helped", tag: "gratitude", mode: "quick" }, // ORIGINAL
  { text: "i don't know, just not sure about anything right now", tag: "uncertain", mode: "quick" }, // ORIGINAL
  { text: "let's just talk about something else for a bit", tag: "open_chat", mode: "quick" }, // ORIGINAL
  { text: "actually, something else -- change of topic", tag: "topic_switch", mode: "quick" }, // ORIGINAL
  { text: "do you think my sleep has been affecting my mood this week?", tag: "health_reference", mode: "quick" }, // ORIGINAL
  { text: "i only got about 4 hours of sleep last night", tag: "sleep_short", mode: "quick" },
  { text: "my step count has been way down this week", tag: "health_reference_steps", mode: "quick" },
  { text: "idk just tired i guess", tag: "short_fragment", mode: "quick" },
  { text: "can we talk about my relationship with my family?", tag: "relationship_request", mode: "quick" }, // ORIGINAL
  { text: "had a good talk with my sister today, felt a lot lighter afterward", tag: "positive_update", mode: "quick" },
  { text: "i think i'm just bored today, nothing going on", tag: "boredom", mode: "quick" },
  { text: "feeling kind of lonely tonight", tag: "loneliness", mode: "quick" },
  { text: "i got the promotion!", tag: "celebration", mode: "quick" },
  { text: "ugh today was rough", tag: "vent_no_advice", mode: "quick" },
  { text: "can you just tell me what to do about this", tag: "decision_support", mode: "quick" },
  { text: "wait that's not what i meant, let me explain again", tag: "clarification_request", mode: "quick" },
  { text: "i keep putting off this project and i don't know why", tag: "procrastination", mode: "quick" },
  { text: "money's been really tight lately and it's stressing me out", tag: "financial_stress", mode: "quick" },
  { text: "i have a doctor's appointment tomorrow and i'm nervous about it", tag: "appointment_anxiety", mode: "quick" },
  { text: "small win today, i actually went for a run", tag: "small_win", mode: "quick" },
  { text: "traveling this week and my routine is all over the place", tag: "routine_disruption", mode: "quick" },
  { text: "just checking in before bed", tag: "evening_checkin", mode: "quick" },

  // -- deep (13) --
  { text: "work has been piling up and I can't keep up, I feel stuck and drained every single day this week", tag: "workload_deep", mode: "deep" }, // ORIGINAL
  { text: "I feel really anxious and overwhelmed today, I don't know why", tag: "distress_signal", mode: "deep" }, // ORIGINAL
  { text: "got into an argument with my roommate over something small, still annoyed", tag: "conflict", mode: "deep" },
  { text: "i've been comparing myself to everyone at work and it's exhausting", tag: "comparison_to_others", mode: "deep" },
  { text: "i don't know what i'm doing with my career direction anymore", tag: "career_uncertainty", mode: "deep" },
  { text: "i think i'm still upset about losing my grandmother last year, it comes up sometimes", tag: "grief", mode: "deep" },
  { text: "i keep snapping at people i care about and i hate that about myself", tag: "self_doubt", mode: "deep" },
  { text: "i said something i regret to my partner and i don't know how to fix it", tag: "relationship_conflict_followup", mode: "deep" },
  { text: "i feel like i'm burnt out but i can't tell anyone at work", tag: "burnout", mode: "deep" },
  { text: "i've been avoiding my friends lately and i'm not totally sure why", tag: "avoidance", mode: "deep" },
  { text: "i'm excited but also terrified about moving to a new city next month", tag: "mixed_emotions", mode: "deep" },
  { text: "i keep starting things and never finishing them, it's frustrating", tag: "habit_struggle", mode: "deep" },
  { text: "i had a huge fight with my mom about something that happened years ago", tag: "family_obligation", mode: "deep" },

  // -- analysis (12) --
  { text: "I keep noticing I feel worse on Sundays before the work week starts, and I always end up snapping at people I care about because I'm dreading Monday", tag: "long_reflective", mode: "analysis" }, // ORIGINAL
  { text: "have you noticed any patterns in how i've been feeling this month?", tag: "pattern_recognition", mode: "analysis" },
  { text: "looking back at this whole year, i feel like i've changed a lot but i can't pin down how", tag: "past_reflection", mode: "analysis" },
  { text: "i want to set some goals for next month but i don't know where to start", tag: "goal_setting", mode: "analysis" },
  { text: "i think i need to set better boundaries with my friend but i'm scared of the conversation", tag: "boundary_setting", mode: "analysis" },
  { text: "every time something good happens i wait for it to fall apart, is that normal", tag: "self_doubt_pattern", mode: "analysis" },
  { text: "i've been trying to forgive myself for a mistake i made last year and it's hard", tag: "forgiveness", mode: "analysis" },
  { text: "i feel like i'm losing my creative spark lately and i don't know why", tag: "creative_block", mode: "analysis" },
  { text: "my friendships feel like they're drifting apart and i don't know if it's me", tag: "friendship_drift", mode: "analysis" },
  { text: "i want to understand why i always avoid conflict instead of addressing it", tag: "avoidance_behavior_pattern", mode: "analysis" },
  { text: "i've been thinking about what actually makes me happy versus what i think should make me happy", tag: "self_reflection_values", mode: "analysis" },
  { text: "things have felt uncertain since the layoffs at work, i don't know what's next for me", tag: "future_uncertainty", mode: "analysis" },
];

const MODES = ["quick", "deep", "analysis"];

// See the file header: EVAL_REPEATS=N re-runs the full prompt set N times so
// summarizeRepeats() below can report a mean +/- standard deviation across
// independent runs, instead of a single point estimate that gives no sense
// of how much a single run's numbers could plausibly vary.
const REPEATS = Math.max(1, parseInt(process.env.EVAL_REPEATS || "1", 10));

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// One summary per repeat, plus mean/stdDev across repeats for the metrics
// that matter for the paper's Results table. Only meaningful when
// REPEATS > 1; the pooled `summarize()` result (all repeats combined) is
// still reported separately as the larger-n overall estimate.
function summarizeRepeats(runs) {
  const byRepeat = [];
  for (let rep = 1; rep <= REPEATS; rep += 1) {
    const repRuns = runs.filter((r) => r.repeat === rep);
    if (repRuns.length) byRepeat.push({ repeat: rep, ...summarize(repRuns) });
  }
  const acceptedRates = byRepeat.map((s) => s.acceptedRate);
  const fallbackRates = byRepeat.map((s) => s.fallbackRate);
  const avgLatencies = byRepeat.map((s) => s.latency.avgMs);
  return {
    repeats: byRepeat.length,
    byRepeat,
    variance: {
      acceptedRate: { mean: mean(acceptedRates), stdDev: stdDev(acceptedRates) },
      fallbackRate: { mean: mean(fallbackRates), stdDev: stdDev(fallbackRates) },
      avgLatencyMs: { mean: mean(avgLatencies), stdDev: stdDev(avgLatencies) },
    },
  };
}

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

async function runOne(promptText, tag, mode, repeat) {
  const start = process.hrtime.bigint();
  let outcome;
  try {
    const result = await processChatTurn({
      userId: EVAL_USER_ID,
      userMessage: promptText,
      chatSettings: { mode },
    });
    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
    const audit = await AuditLog.findOne({ userId: EVAL_USER_ID }).sort({ createdAt: -1 });
    outcome = {
      tag,
      mode,
      repeat,
      prompt: promptText,
      latencyMs: Math.round(latencyMs),
      status: audit?.status || "unknown",
      fallback: !!result.payload.fallback,
      confidence: result.payload.confidence,
      source: result.payload.source,
      parseFailed: audit?.policyDecisions?.parseFailed ?? null,
      error: null,
    };
  } catch (error) {
    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
    outcome = {
      tag,
      mode,
      repeat,
      prompt: promptText,
      latencyMs: Math.round(latencyMs),
      status: "error",
      fallback: null,
      confidence: null,
      source: null,
      parseFailed: null,
      error: error?.message || String(error),
    };
  }
  return outcome;
}

function summarize(runs) {
  const total = runs.length;
  const errors = runs.filter((r) => r.status === "error").length;
  const attempted = total - errors;
  const accepted = runs.filter((r) => r.status === "accepted").length;
  const rejected = runs.filter((r) => r.status === "rejected").length;
  const fallbackTrue = runs.filter((r) => r.fallback === true).length;

  const latencies = runs.filter((r) => r.status !== "error").map((r) => r.latencyMs).sort((a, b) => a - b);
  const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

  const bySource = {};
  for (const r of runs) {
    if (!r.source) continue;
    bySource[r.source] = (bySource[r.source] || 0) + 1;
  }

  const byMode = {};
  for (const mode of MODES) {
    const modeRuns = runs.filter((r) => r.mode === mode);
    if (!modeRuns.length) continue;
    byMode[mode] = {
      total: modeRuns.length,
      acceptedRate: modeRuns.filter((r) => r.status === "accepted").length / modeRuns.length,
      fallbackRate: modeRuns.filter((r) => r.fallback === true).length / modeRuns.length,
      avgLatencyMs:
        Math.round(
          (modeRuns.filter((r) => r.status !== "error").reduce((a, r) => a + r.latencyMs, 0) /
            Math.max(1, modeRuns.filter((r) => r.status !== "error").length)) * 10,
        ) / 10,
    };
  }

  return {
    totalRuns: total,
    errors,
    acceptedRate: attempted ? accepted / attempted : 0,
    rejectedRate: attempted ? rejected / attempted : 0,
    fallbackRate: attempted ? fallbackTrue / attempted : 0,
    latency: {
      avgMs: Math.round(avgLatency * 10) / 10,
      medianMs: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      minMs: latencies[0] || 0,
      maxMs: latencies[latencies.length - 1] || 0,
    },
    responseSourceBreakdown: bySource,
    byMode,
  };
}

function toMarkdown(summary, runs, startedAt, repeatSummary) {
  const lines = [];
  lines.push(`# Chat engine evaluation -- ${startedAt}`);
  lines.push("");
  lines.push(`Total turns run: ${summary.totalRuns} (${summary.errors} errored before completion)`);
  if (repeatSummary) {
    lines.push(
      `Ran across ${repeatSummary.repeats} independent repeats of the full prompt set (EVAL_REPEATS=${repeatSummary.repeats}) -- see "Run-to-run variance" below for mean +/- standard deviation instead of a single-run point estimate.`,
    );
  }
  lines.push("");
  lines.push("## Table I -- Primary performance metrics");
  lines.push("");
  lines.push("| Metric | Observed value |");
  lines.push("|---|---|");
  lines.push(`| Turn acceptance rate | ${(summary.acceptedRate * 100).toFixed(1)}% |`);
  lines.push(`| Turn rejection rate (verification gate triggered) | ${(summary.rejectedRate * 100).toFixed(1)}% |`);
  lines.push(`| Fallback rate (payload.fallback = true) | ${(summary.fallbackRate * 100).toFixed(1)}% |`);
  lines.push(`| Average latency | ${summary.latency.avgMs} ms |`);
  lines.push(`| Median latency | ${summary.latency.medianMs} ms |`);
  lines.push(`| p95 latency | ${summary.latency.p95Ms} ms |`);
  lines.push(`| Automated unit/integration tests passed | see \`npm test\` output, service.test.js |`);
  lines.push("");
  if (repeatSummary) {
    lines.push("## Run-to-run variance (mean +/- standard deviation across independent repeats)");
    lines.push("");
    lines.push("| Metric | Mean | Std dev | n repeats |");
    lines.push("|---|---|---|---|");
    lines.push(
      `| Acceptance rate | ${(repeatSummary.variance.acceptedRate.mean * 100).toFixed(1)}% | ${(repeatSummary.variance.acceptedRate.stdDev * 100).toFixed(1)} pp | ${repeatSummary.repeats} |`,
    );
    lines.push(
      `| Fallback rate | ${(repeatSummary.variance.fallbackRate.mean * 100).toFixed(1)}% | ${(repeatSummary.variance.fallbackRate.stdDev * 100).toFixed(1)} pp | ${repeatSummary.repeats} |`,
    );
    lines.push(
      `| Average latency | ${repeatSummary.variance.avgLatencyMs.mean.toFixed(1)} ms | ${repeatSummary.variance.avgLatencyMs.stdDev.toFixed(1)} ms | ${repeatSummary.repeats} |`,
    );
    lines.push("");
    lines.push("| Repeat | Acceptance rate | Fallback rate | Avg latency |");
    lines.push("|---|---|---|---|");
    for (const r of repeatSummary.byRepeat) {
      lines.push(`| ${r.repeat} | ${(r.acceptedRate * 100).toFixed(1)}% | ${(r.fallbackRate * 100).toFixed(1)}% | ${r.latency.avgMs} ms |`);
    }
    lines.push("");
  }
  lines.push("## Table II -- Mode-wise behavior snapshot");
  lines.push("");
  lines.push("| Mode | n | Acceptance rate | Fallback rate | Avg latency |");
  lines.push("|---|---|---|---|---|");
  for (const [mode, m] of Object.entries(summary.byMode)) {
    lines.push(`| ${mode} | ${m.total} | ${(m.acceptedRate * 100).toFixed(1)}% | ${(m.fallbackRate * 100).toFixed(1)}% | ${m.avgLatencyMs} ms |`);
  }
  lines.push("");
  lines.push("## Response source breakdown");
  lines.push("");
  lines.push("| Source | Count |");
  lines.push("|---|---|");
  for (const [source, count] of Object.entries(summary.responseSourceBreakdown)) {
    lines.push(`| ${source} | ${count} |`);
  }
  lines.push("");
  lines.push("## Per-turn detail");
  lines.push("");
  lines.push("| Prompt tag | Mode | Status | Fallback | Confidence | Source | Latency (ms) |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of runs) {
    lines.push(
      `| ${r.tag} | ${r.mode} | ${r.status} | ${r.fallback} | ${r.confidence ?? "-"} | ${r.source ?? "-"} | ${r.latencyMs} |`,
    );
  }
  lines.push("");
  lines.push(
    "Method: each row is one real call through `processChatTurn` against this repository's actual chat engine, " +
      "connected to the MongoDB instance and AI provider configured in `server/.env` at the time of the run. " +
      "The evaluation user was seeded with 8 varied journal entries and 9 days of complete/confident synthetic " +
      "health data so both the health-eligible and evidence-grounded code paths were exercised. " +
      (repeatSummary
        ? `This run repeated the full prompt set ${repeatSummary.repeats} independent times (EVAL_REPEATS=${repeatSummary.repeats}); ` +
          "Table I above is pooled across all repeats (larger n), and the run-to-run variance table reports mean +/- " +
          "standard deviation across those independent repeats. Still a fixed-prompt-set engineering evaluation, not " +
          "a user study -- see the paper's Limitations section."
        : "This is a single-run engineering evaluation on a fixed prompt set, not a user study -- see the paper's " +
          "Limitations section. Set EVAL_REPEATS=N to re-run N times and report run-to-run variance instead of a " +
          "single point estimate."),
  );
  return lines.join("\n");
}

async function main() {
  await mongoose.connect(env.MONGO_URI);
  console.log(`Connected to ${env.MONGO_URI}`);

  await seed();
  console.log("Seed data ready.");

  const runs = [];
  const startedAt = new Date().toISOString();
  let count = 0;

  if (REPEATS > 1) {
    console.log(`EVAL_REPEATS=${REPEATS} -- running the full prompt set ${REPEATS} times for variance.`);
  }

  // Each of the 50 prompts runs once, in its own designated mode (see
  // PROMPTS above), per repeat. The whole thing repeats REPEATS times
  // (default 1, i.e. a single pass through all 50) when EVAL_REPEATS is
  // set -- EVAL_REPEATS=10 gives the paper's target pooled n=500.
  for (let rep = 1; rep <= REPEATS; rep += 1) {
    for (const p of PROMPTS) {
      count += 1;
      process.stdout.write(`  [rep ${rep}/${REPEATS}] [${count}] ${p.tag} (${p.mode})... `);
      const outcome = await runOne(p.text, p.tag, p.mode, rep);
      console.log(`${outcome.status} (${outcome.latencyMs}ms)`);
      runs.push(outcome);
    }
  }

  const summary = summarize(runs);
  const repeatSummary = REPEATS > 1 ? summarizeRepeats(runs) : null;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(OUT_DIR, `chat-engine-eval-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `chat-engine-eval-${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify({ startedAt, repeats: REPEATS, summary, repeatSummary, runs }, null, 2));
  fs.writeFileSync(mdPath, toMarkdown(summary, runs, startedAt, repeatSummary));

  console.log("\n=== Summary (pooled across all repeats) ===");
  console.log(JSON.stringify(summary, null, 2));
  if (repeatSummary) {
    console.log("\n=== Run-to-run variance ===");
    console.log(JSON.stringify(repeatSummary.variance, null, 2));
  }
  console.log(`\nWritten:\n  ${jsonPath}\n  ${mdPath}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Eval run failed:", err);
  process.exit(1);
});
