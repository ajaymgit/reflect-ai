import HealthData from "../../models/HealthData.js";
import JournalEntry from "../../models/JournalEntry.js";
import RetrospectAnalysis from "../../models/RetrospectAnalysis.js";
import { env, policyConfig } from "../../shared/config/env.js";
import { computeHealthMoodCorrelations } from "../../shared/utils/correlation.js";
import { fetchWithTimeout } from "../../shared/utils/fetchWithTimeout.js";
import { logError, logInfo } from "../../shared/utils/logger.js";
import { visibleJournalFilter } from "../../shared/utils/visibleJournal.js";

// Mirrors the Ollama/cloud config resolution in chat/service.js, duplicated
// rather than imported from there. Chat's AI routing is safety-critical and
// was hard-won debugging real production bugs (silent catches, mislabeled
// sources, a broken evidence/confidence verification gate -- see the
// comments throughout that file). Sharing mutable module state across two
// independently-evolving features risks a change made for one silently
// affecting the other; a few dozen lines of config duplication here is a
// smaller, more contained risk than that coupling.
const useOllama = String(env.USE_OLLAMA || "true").toLowerCase() !== "false";
const ollamaBaseUrl = env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const ollamaModel = env.OLLAMA_MODEL || "llama3.2:3b";
// See chat/service.js's identical constant -- only set when OLLAMA_BASE_URL
// points at Ollama's hosted API (https://ollama.com) rather than a local
// instance.
const ollamaAuthHeaders = env.OLLAMA_API_KEY ? { Authorization: `Bearer ${env.OLLAMA_API_KEY}` } : {};

// How long a generated analysis stays "fresh" before the next page load
// triggers a regeneration. Keeps Retrospect responsive to new journal
// entries without hitting the local model on every single page view.
const REGEN_INTERVAL_MS = 12 * 60 * 60 * 1000;
const MIN_ENTRIES_FOR_AI = 3;

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const block = String(raw || "").match(/\{[\s\S]*\}/);
    if (!block) return null;
    try {
      return JSON.parse(block[0]);
    } catch {
      return null;
    }
  }
}

// Same health-data eligibility bar used by chat/service.js's
// calculateHealthQuality, so Retrospect never claims a health correlation
// off thinner data than Chat is willing to.
function calculateHealthQuality(healthRecords) {
  const days = healthRecords.length;
  if (!days) return { days: 0, completeness: 0, confidence: 0, eligible: false };
  const completeness = healthRecords.reduce((sum, h) => sum + (h.completeness || 0), 0) / healthRecords.length;
  const confidence = healthRecords.reduce((sum, h) => sum + (h.confidence || 0), 0) / healthRecords.length;
  const eligible =
    days >= policyConfig.minHealthDays &&
    completeness >= policyConfig.minHealthCompleteness &&
    confidence >= policyConfig.minHealthConfidence;
  return { days, completeness, confidence, eligible };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (typeof payload.summary !== "string" || !payload.summary.trim()) return false;
  if (!Array.isArray(payload.detectedPatterns)) return false;
  if (!Array.isArray(payload.behavioralLoops)) return false;
  if (typeof payload.healthCorrelation !== "string") return false;
  if (typeof payload.socraticQuestion !== "string" || !payload.socraticQuestion.trim()) return false;
  if (typeof payload.confidence !== "number" || !Number.isFinite(payload.confidence)) return false;
  return true;
}

async function callOllama(prompt) {
  const response = await fetchWithTimeout(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ollamaAuthHeaders },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      format: "json",
      options: { temperature: 0.3 },
      messages: [
        {
          role: "system",
          content: "Return strict JSON only. No markdown, no explanations, no prose outside JSON.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Ollama request failed with status ${response.status}`);
  }
  const data = await response.json();
  const text = String(data?.message?.content || "").replace(/```json|```/g, "").trim();
  return parseJsonSafe(text);
}

function buildPrompt({ journals, health, healthEligible, correlationDescription }) {
  return `
You are ReflectAI's retrospective pattern analyst. Look at someone's recent journal entries${healthEligible ? " and health metrics" : ""} and identify honest, real recurring patterns -- never invented ones.
Return ONLY valid JSON with this exact shape:
{
  "summary": "one or two sentences describing the dominant emotional pattern across entries",
  "detectedPatterns": ["short phrase", "short phrase"],
  "behavioralLoops": ["Trigger -> behavior -> outcome", "..."],
  "healthCorrelation": "one sentence about the mood/health relationship",
  "socraticQuestion": "one open-ended reflective question tied to the strongest pattern you found",
  "confidence": 0.75
}
Rules:
- Base every claim ONLY on the journal entries and health data given below. Never invent a pattern that isn't actually supported by at least two entries.
- If entries are too few or too varied to find a real pattern, say so honestly in "summary" and leave detectedPatterns/behavioralLoops as empty arrays rather than fabricating one.
- behavioralLoops must follow a "Trigger -> Behavior -> Outcome" style phrase, grounded in specific entries (e.g. "Heavy meeting days -> skipped breaks -> evening exhaustion"), not generic self-help language.
- confidence is REQUIRED: a real number strictly between 0 and 1 reflecting how strongly the data actually supports these patterns. Never output exactly 0, and never just copy the 0.75 shown above -- that is only a format example.
- Never diagnose, never give medical advice.
- Keep summary under 40 words, each detectedPattern under 6 words, each behavioralLoop under 12 words, socraticQuestion under 24 words.
- For "healthCorrelation" specifically: a real statistical correlation has ALREADY been computed for you below ("Computed health/mood correlation") -- use that as the actual finding and just phrase it naturally in one sentence. Do not attempt to compute your own correlation from the raw health rows, and do not contradict the computed result. If it says there wasn't enough data, say that honestly instead of guessing a relationship.

Computed health/mood correlation (this is real math, not a guess -- use it as-is):
${correlationDescription || "Not enough paired health + journal data yet to compute a real correlation."}

Recent journal entries (most recent first):
${JSON.stringify(journals)}

${healthEligible ? `Recent health data:\n${JSON.stringify(health)}` : "No sufficiently complete health data available yet -- do not make health claims."}
`;
}

// Honest, non-AI fallback when Ollama is unavailable or too few entries
// exist -- real stats derived directly from the data, matching the
// established "no fabricated content" principle from chat/service.js's
// heuristic responder, rather than templated filler dressed up as insight.
function heuristicAnalysis({ journals, healthEligible, correlationDescription }) {
  if (journals.length < MIN_ENTRIES_FOR_AI) {
    return {
      summary: "Not enough journal entries yet to identify a recurring pattern with confidence.",
      detectedPatterns: [],
      behavioralLoops: [],
      healthCorrelation: correlationDescription || "Not enough data yet to identify a health correlation.",
      socraticQuestion: "What's one thing you noticed about yourself this week?",
      confidence: 0,
    };
  }
  const moodCounts = journals.reduce((acc, j) => {
    acc[j.mood] = (acc[j.mood] || 0) + 1;
    return acc;
  }, {});
  const [topMood, topCount] = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];
  const themeCounts = journals.reduce((acc, j) => {
    (j.themes || []).forEach((t) => {
      acc[t] = (acc[t] || 0) + 1;
    });
    return acc;
  }, {});
  const topThemes = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
  return {
    summary: `"${topMood}" is the most frequent mood across your last ${journals.length} entries (${topCount} of them).`,
    detectedPatterns: topThemes,
    behavioralLoops: [],
    // Unlike everything else in this fallback, this doesn't need the AI to
    // be down-graded -- it's real computed statistics either way (see
    // shared/utils/correlation.js), so the non-AI path gets just as honest
    // an answer here as the AI path does.
    healthCorrelation:
      correlationDescription ||
      (healthEligible
        ? "Health data is present, but not enough of it lines up with journal entries yet to compute a correlation."
        : "Not enough health data yet to identify a correlation."),
    socraticQuestion: `What tends to happen right before you feel ${topMood}?`,
    confidence: 0.4,
  };
}

async function runGeneration({ journals, health, healthQuality, correlationDescription }) {
  const journalPayload = journals.map((j) => ({
    content: j.content,
    mood: j.mood,
    themes: j.themes,
    date: j.createdAt,
  }));
  const healthPayload = health.map((h) => ({
    date: h.date,
    sleepHours: h.sleepHours,
    steps: h.steps,
    stressScore: h.stressScore,
    restingHeartRate: h.restingHeartRate,
  }));

  if (journals.length >= MIN_ENTRIES_FOR_AI && useOllama) {
    try {
      const prompt = buildPrompt({
        journals: journalPayload,
        health: healthPayload,
        healthEligible: healthQuality.eligible,
        correlationDescription,
      });
      const raw = await callOllama(prompt);
      if (validatePayload(raw)) {
        logInfo("Ollama generated retrospect analysis", { ollamaModel });
        return { payload: raw, source: "ollama" };
      }
      logError("Ollama retrospect response failed schema validation", { ollamaModel, raw });
    } catch (error) {
      logError("Ollama retrospect generation failed", {
        ollamaModel,
        ollamaBaseUrl,
        error: error?.message || String(error),
      });
    }
  }

  return {
    payload: heuristicAnalysis({ journals: journalPayload, healthEligible: healthQuality.eligible, correlationDescription }),
    source: "heuristic",
  };
}

// Generates a fresh RetrospectAnalysis for a user from their real journal +
// health data, saves it, and returns it (with getters applied, so callers
// get plain decrypted values). Exported separately from the route so it can
// also be called from a future scheduled job without duplicating this logic.
export async function generateRetrospectAnalysis(userId) {
  // visibleJournalFilter excludes time-capsule entries not yet due --
  // without this, `journals` (fed straight into the AI generation prompt
  // below) could hand a sealed capsule's actual content to the model,
  // whose generated summary/behavioralLoops/socraticQuestion could then
  // reference or paraphrase what's written in a letter someone sealed
  // specifically so even they couldn't read it early.
  const [journals, health, correlationHealth, correlationJournals] = await Promise.all([
    JournalEntry.find(visibleJournalFilter({ userId })).sort({ createdAt: -1 }).limit(20),
    HealthData.find({
      userId,
      date: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    }).sort({ date: -1 }),
    // Wider windows purely for correlation, same reasoning as
    // health/routes.js's /overview -- more paired days makes for a more
    // reliable Pearson coefficient than the 14-day window used for the AI's
    // main journal/health context above.
    HealthData.find({ userId }).sort({ date: -1 }).limit(60),
    JournalEntry.find(visibleJournalFilter({ userId })).sort({ createdAt: -1 }).limit(90).select("mood createdAt"),
  ]);
  const healthQuality = calculateHealthQuality(health);
  const correlations = computeHealthMoodCorrelations({ healthRows: correlationHealth, journalRows: correlationJournals });
  const { payload, source } = await runGeneration({
    journals,
    health,
    healthQuality,
    correlationDescription: correlations.description,
  });

  const saved = await RetrospectAnalysis.create({
    userId,
    summary: payload.summary,
    detectedPatterns: payload.detectedPatterns,
    behavioralLoops: payload.behavioralLoops,
    healthCorrelation: payload.healthCorrelation,
    socraticQuestion: payload.socraticQuestion,
    confidence: payload.confidence,
  });

  return { ...saved.toObject({ getters: true }), source };
}

// Returns the latest analysis for a user, regenerating it first if none
// exists yet or the cached one is older than REGEN_INTERVAL_MS. Falls back
// to whatever cached analysis exists (even if stale) if generation throws,
// so a transient Ollama hiccup never breaks the Retrospect page outright.
export async function getOrRefreshRetrospectAnalysis(userId, { journalCount } = {}) {
  const latest = await RetrospectAnalysis.findOne({ userId }).sort({ createdAt: -1 });
  const stale = !latest || Date.now() - new Date(latest.createdAt).getTime() > REGEN_INTERVAL_MS;

  if (stale && (journalCount === undefined || journalCount >= MIN_ENTRIES_FOR_AI)) {
    try {
      return await generateRetrospectAnalysis(userId);
    } catch (error) {
      logError("Retrospect analysis generation failed, serving cached/default", {
        error: error?.message || String(error),
      });
    }
  }

  if (latest) {
    return { ...latest.toObject({ getters: true }), source: "cached" };
  }
  return null;
}
