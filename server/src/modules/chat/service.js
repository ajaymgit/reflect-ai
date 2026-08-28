import OpenAI from "openai";
import AuditLog from "../../models/AuditLog.js";
import ChatSession from "../../models/ChatSession.js";
import HealthData from "../../models/HealthData.js";
import JournalEntry from "../../models/JournalEntry.js";
import RetrospectAnalysis from "../../models/RetrospectAnalysis.js";
import { env, policyConfig } from "../../shared/config/env.js";
import { findSemanticMatches } from "../../shared/services/embeddings.js";
import { AppError } from "../../shared/utils/AppError.js";
import { fetchWithTimeout } from "../../shared/utils/fetchWithTimeout.js";
import { logError, logInfo } from "../../shared/utils/logger.js";
import { visibleJournalFilter } from "../../shared/utils/visibleJournal.js";

// Appends one turn to a user's chat session. Deliberately NOT
// `ChatSession.findOneAndUpdate({...}, { $push: {...} }, { upsert: true })`
// (the previous implementation) -- $push via a raw update operator has
// inconsistent, version-dependent behavior around whether it runs a
// subdocument schema's custom setters, and userMessage/aiResponse/reasoning/
// evidence[].quote now depend on their setters running to get encrypted
// (see models/ChatSession.js). `session.turns.push(obj)` on an already-
// loaded Mongoose document is unambiguous, well-documented behavior: it
// constructs a real subdocument (running every setter) before adding it.
async function appendChatTurn(userId, turn) {
  let session = await ChatSession.findOne({ userId });
  if (!session) {
    session = new ChatSession({ userId, turns: [] });
  }
  session.turns.push(turn);
  try {
    await session.save();
  } catch (err) {
    // ChatSession.userId is unique -- a duplicate-key error here means
    // another request for the same user created the session between our
    // findOne and save (a narrow race, since this only matters for the same
    // user's near-simultaneous messages). Re-fetch the now-existing session
    // and retry once rather than lose the turn or surface a raw 500.
    if (err?.code === 11000) {
      session = await ChatSession.findOne({ userId });
      session.turns.push(turn);
      await session.save();
    } else {
      throw err;
    }
  }
  return session;
}

// Previously this app could only ever use ONE cloud provider at a time --
// `usingGeminiCompat` picked Gemini only when OPENAI_API_KEY was absent, so
// setting both keys silently ignored Gemini's entirely. Now every key that's
// actually configured gets its own independent client, and generateInsight()
// below tries all of them in order (Ollama -> Gemini -> OpenAI) instead of
// picking exactly one at startup. Gemini is tried before OpenAI when both are
// set purely as a cost default (2.0 Flash is normally the cheaper of the
// two) -- there's no correctness reason for this order, just economics.
const useOllama = String(env.USE_OLLAMA || "true").toLowerCase() !== "false";
const ollamaBaseUrl = env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const ollamaModel = env.OLLAMA_MODEL || "llama3.2:3b";
// Only set when OLLAMA_BASE_URL points at Ollama's hosted API rather than a
// local/self-hosted instance -- see env.js. Spread into fetch headers below
// as a no-op ({}) when unset, so local Ollama (which never expects this
// header) is unaffected.
const ollamaAuthHeaders = env.OLLAMA_API_KEY ? { Authorization: `Bearer ${env.OLLAMA_API_KEY}` } : {};

const geminiModel = env.GEMINI_MODEL || env.AI_MODEL || "gemini-2.0-flash";
const geminiClient = env.GEMINI_API_KEY
  ? new OpenAI({
      apiKey: env.GEMINI_API_KEY,
      timeout: 12000,
      maxRetries: 1,
      // Gemini's OpenAI-compatibility shim only implements the classic
      // chat.completions endpoint, not OpenAI's newer Responses API -- see
      // the two separate call shapes in generateInsight() below.
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    })
  : null;

const openaiModel = env.OPENAI_MODEL || env.AI_MODEL || "gpt-4.1-mini";
const openaiTemperature = 0.45;
const openaiClient = env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 12000, maxRetries: 1 })
  : null;

// Hard ceiling on a single cloud response, mirroring Ollama's own
// num_predict: 320 cap below. The prompt already instructs the model to
// keep insight/question under 28/24 words, but that's a request, not an
// enforced limit -- without this, a model that ignores it (or drifts into
// repetition) could generate an arbitrarily long, and therefore arbitrarily
// more expensive, response with nothing stopping it. 400 tokens is
// generously above what a schema-conformant JSON reply actually needs.
const CLOUD_MAX_OUTPUT_TOKENS = 400;
const fallbackTemplates = [
  "I might be missing some context, so I don't want to assume -- what feels most important for you right now?",
  "I want to really understand where you're at. Which part of this should we start with?",
  "Thanks for sharing that. What feels heaviest or most important in this moment?",
  "I'm here with you. Where would you like to begin?",
];

const topicSwitchRegex =
  /\b(something else|different topic|change topic|not this|stop talking about|move on|new topic|talk about something else)\b/i;
const greetingRegex = /\b(hi|hello|hey|yo|good morning|good evening)\b/i;
const positiveRegex = /\b(happy|great|good|excited|grateful|better|awesome|nice)\b/i;
const openChatRegex =
  /\b(let'?s talk|let us talk|open chat|free talk|just chat|talk about anything|random talk)\b/i;
// Catches ordinary small talk that isn't about the user's own feelings or
// journal patterns at all -- previously anything not matching a specific
// intent above (greeting/gratitude/relationship/etc.) fell straight through
// to "reflection", which always routes to a randomly-assigned emotional
// pattern question (buildHeuristicPayload), even for something as plain as
// "what's up" or "do you have a favorite color." This gives the heuristic
// path a real "just chatting" mode for that case too, matching the AI
// prompt's own new rule that generic conversation doesn't need to be
// redirected back to reflection every time.
const genericChatRegex =
  /\b(what'?s up|how'?s it going|how are you( doing)?|what do you think|your opinion|do you like|what'?s your favorite|favourite|tell me a joke|fun fact|who are you|what can you do|what are you|random question|wanna chat|want to chat|can we talk about|chat about)\b/i;
const relationshipRegex = /\b(relationship|relationships|friend|friends|partner|family|dating)\b/i;
const gratitudeRegex = /\b(thank you|thanks|appreciate)\b/i;
const distressRegex = /\b(anxious|panic|hopeless|worthless|overwhelmed|burnout|depressed)\b/i;
const uncertainRegex = /\b(i don't know|i dont know|idk|not sure|confused)\b/i;
const affirmativeRegex = /^(yes|yeah|yep|ok|okay|sure)$/i;
const clarificationRegex = /\b(what worked|what worked today|what worked yesterday|what do you mean|can you explain|which one)\b/i;
const problemSignalRegex =
  /\b(problem|issue|struggling|hard|difficult|stuck|can't|cannot|drained|overloaded|overwhelmed|stress|anxious|sad|angry|tired)\b/i;

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/abiut|abouut|abot|abotu/g, "about")
    .replace(/someting|someting|sometihng/g, "something")
    .replace(/hppy|happpy/g, "happy")
    .replace(/workedd/g, "worked")
    .replace(/yestarday|yesterdayy/g, "yesterday")
    .replace(/fiend/g, "friend")
    .replace(/[\\`~!@#$%^&*()_+=[\]{};:'",.<>/?|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectThemes(entries) {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "to",
    "i",
    "of",
    "in",
    "it",
    "is",
    "felt",
    "noticed",
    "today",
    "day",
    "after",
    "before",
    "with",
    "that",
    "this",
  ]);
  const counts = {};
  for (const e of entries) {
    const words = e.content.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    for (const w of words) {
      if (w.length < 4 || stop.has(w)) continue;
      counts[w] = (counts[w] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

function buildReadiness({ journals, healthQuality, themes }) {
  const journalFrequency = Math.min(journals.length / 10, 1);
  const moodDiversity = new Set(journals.map((j) => j.mood)).size / 5;
  const moodStability = 1 - Math.min(moodDiversity, 1);
  const recurringThemes = Math.min(themes.length / 5, 1);
  const health = Math.min(healthQuality.completeness, 1);

  const score = Math.round(
    (journalFrequency * 0.3 + moodStability * 0.2 + recurringThemes * 0.3 + health * 0.2) * 100,
  );

  const label = score >= 70 ? "High" : score >= 45 ? "Moderate" : "Low";
  return { score, label };
}

export function calculateHealthQuality(healthRecords) {
  const days = healthRecords.length;
  if (!days) return { days: 0, completeness: 0, confidence: 0, eligible: false };
  const completeness =
    healthRecords.reduce((sum, h) => sum + (h.completeness || 0), 0) / healthRecords.length;
  const confidence =
    healthRecords.reduce((sum, h) => sum + (h.confidence || 0), 0) / healthRecords.length;
  const eligible =
    days >= policyConfig.minHealthDays &&
    completeness >= policyConfig.minHealthCompleteness &&
    confidence >= policyConfig.minHealthConfidence;

  return { days, completeness, confidence, eligible };
}

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const block = raw.match(/\{[\s\S]*\}/);
    if (!block) return null;
    try {
      return JSON.parse(block[0]);
    } catch {
      return null;
    }
  }
}

function buildEvidenceCandidates(journals, userMessage, intent) {
  const text = normalizeText(userMessage);
  const scored = journals.map((j) => {
    const content = String(j.content || "").toLowerCase();
    let score = 0;
    if (intent === "positive_checkin" && (j.mood === "happy" || j.mood === "calm")) score += 3;
    if (intent === "greeting" || intent === "open_chat") score += 1;
    if (intent === "distress_signal" && (j.mood === "sad" || j.mood === "stressed" || j.mood === "angry")) score += 3;
    if (intent === "gratitude" && (j.mood === "happy" || j.mood === "calm")) score += 3;
    if (text.includes("relationship") && /friend|family|partner|relationship/.test(content)) score += 4;
    if (text.includes("happy") && /happy|grateful|optimism|joy/.test(content)) score += 4;
    if (text.includes("tired") && /tired|drained|fatigue|sleep/.test(content)) score += 4;
    if (text.includes("work") && /work|meeting|deadline|office/.test(content)) score += 4;
    score += Math.max(0, 2 - Math.floor((Date.now() - new Date(j.createdAt).getTime()) / (2 * 86400000)));
    return { j, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ j }) => ({
    journalId: String(j._id),
    // Previously a hard 220-char cut with no ellipsis -- this evidence quote
    // is shown verbatim in Chat's "journal reference" panel, so a mid-word
    // cutoff there read as a rendering bug rather than an intentional
    // excerpt.
    quote: truncateAtWord(j.content, 220),
    date: j.createdAt,
    mood: j.mood,
  }));
}

function truncateAtWord(text, maxLen) {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const clean = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${clean}…`;
}

// Prefers semantic (meaning-based) evidence candidates over the plain
// keyword-scored ones above when possible -- e.g. "what did I say about my
// thesis advisor" can now surface an entry that never uses those exact
// words. Deliberately additive, not a replacement: buildEvidenceCandidates
// above is untouched and still runs as the fallback whenever semantic
// matching comes back empty (no entries embedded yet -- see
// scripts/embedJournalEntries.js -- Ollama unreachable, or the embedding
// model was never pulled), so this can never make evidence retrieval worse
// than it already was, only better when embeddings are available.
async function buildSmartEvidenceCandidates(userId, journalPool, userMessage, intent) {
  if (!journalPool.length) return [];
  try {
    // journalPool already carries `embedding` (buildChatContext now selects
    // it on the same query that produced this pool), so this no longer
    // re-fetches the same documents from Mongo a second time just to add
    // that one field -- same input to findSemanticMatches, one fewer
    // network round-trip per chat turn.
    const semanticMatches = await findSemanticMatches(journalPool, userMessage, { limit: 5 });
    if (semanticMatches.length) {
      logInfo("Using semantic evidence candidates", { count: semanticMatches.length });
      return semanticMatches.map(({ journal, score }) => ({
        journalId: String(journal._id),
        quote: truncateAtWord(journal.content, 220),
        date: journal.createdAt,
        mood: journal.mood,
        semanticScore: score,
      }));
    }
  } catch (error) {
    logError("Semantic evidence lookup failed, falling back to keyword matching", {
      error: error?.message || String(error),
    });
  }
  return buildEvidenceCandidates(journalPool, userMessage, intent);
}

export function normalizeEvidence(evidence, candidates) {
  if (!Array.isArray(evidence)) return [];
  const byId = new Map(candidates.map((c) => [c.journalId, c]));
  const result = evidence
    .map((ev) => {
      const matched = byId.get(String(ev.journalId || ""));
      if (matched) {
        return {
          journalId: matched.journalId,
          quote: ev.quote || matched.quote,
          date: ev.date || matched.date,
        };
      }
      // Small/local models (e.g. a 3B Ollama model) are unreliable at
      // transcribing a 24-char Mongo ObjectId verbatim, so an evidence item
      // can be genuinely grounded in a real candidate journal entry even
      // when journalId fails to match exactly -- the model just mangled the
      // ID while still quoting real content it was given. Recover that case
      // by matching on the quoted text itself instead of discarding it. This
      // still only ever returns a candidate the model was actually shown, so
      // it is not the "fabricated/unrelated evidence" pattern deliberately
      // removed above -- it's the same real evidence, matched by a more
      // reliable signal than a verbatim ID echo.
      const quoteText = normalizeText(String(ev.quote || ""));
      if (quoteText.length >= 15) {
        const byQuote = candidates.find((c) => {
          const candidateText = normalizeText(c.quote);
          return candidateText.includes(quoteText) || quoteText.includes(candidateText.slice(0, 40));
        });
        if (byQuote) {
          return {
            journalId: byQuote.journalId,
            quote: byQuote.quote,
            date: byQuote.date,
          };
        }
      }
      return null;
    })
    .filter(Boolean);
  return result;
}

export function validateAiPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  const required = [
    "schemaVersion",
    "insight",
    "question",
    "evidence",
    "confidence",
    "reasoning",
    "fallback",
  ];
  if (!required.every((k) => k in payload)) return false;
  if (!Array.isArray(payload.evidence)) return false;
  if (typeof payload.confidence !== "number") return false;
  if (typeof payload.fallback !== "boolean") return false;
  return true;
}

export function coerceAiPayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const payload = {
    schemaVersion: "1.0",
    insight: String(rawPayload.insight || rawPayload.summary || rawPayload.observation || ""),
    question: String(rawPayload.question || rawPayload.reply || rawPayload.response || ""),
    evidence: Array.isArray(rawPayload.evidence) ? rawPayload.evidence : [],
    confidence: Number(rawPayload.confidence ?? 0.62),
    reasoning: String(
      rawPayload.reasoning || rawPayload.rationale || "Generated by model and normalized to schema.",
    ),
    fallback: Boolean(rawPayload.fallback ?? false),
    currentFocus: String(rawPayload.currentFocus || rawPayload.focus || "general_reflection"),
  };
  return validateAiPayload(payload) ? payload : null;
}

function fallbackPayload({ question, insight, evidence = [], currentFocus = "user_selected", reasoning } = {}) {
  const template = question || fallbackTemplates[Math.floor(Math.random() * fallbackTemplates.length)];
  return {
    schemaVersion: "1.0",
    insight: insight || "",
    question: template,
    evidence,
    confidence: 0,
    reasoning:
      reasoning || "Fallback activated due to low evidence quality or generation validation failure.",
    fallback: true,
    currentFocus,
  };
}

function scoreMessageDepth(userMessage = "") {
  const text = normalizeText(userMessage);
  if (!text) return 0;
  const tokens = text.split(" ").filter(Boolean);
  let score = 0;
  if (tokens.length >= 10) score += 1;
  if (tokens.length >= 20) score += 1;
  if (/\b(i feel|i felt|i am|i was|i keep|i always|i never)\b/.test(text)) score += 1;
  if (/\bwhy|stuck|hurt|afraid|anxious|alone|overwhelmed|confused|lost\b/.test(text)) score += 1;
  if (/\bbecause|since|after|before\b/.test(text)) score += 1;
  return Math.min(score, 5);
}

export function buildLongitudinalBlueprint({ userMessage, journals = [], themes = [], sessionTurns = [], mode = "quick" }) {
  const depthScore = scoreMessageDepth(userMessage);
  let depthLevel = depthScore >= 4 ? "deep" : depthScore >= 2 ? "reflective" : "light";
  if (mode === "deep") depthLevel = "deep";
  if (mode === "analysis" && depthLevel === "light") depthLevel = "reflective";
  const recentTurns = sessionTurns.slice(-5);
  const unresolvedThread = recentTurns
    .map((t) => String(t.userMessage || ""))
    .reverse()
    .find((msg) => msg && msg.length > 10);
  const recentMoods = journals.slice(0, 5).map((j) => j.mood).filter(Boolean);
  const dominantMood = recentMoods[0] || "reflective";
  const continuityHint =
    unresolvedThread && normalizeText(userMessage).length < 25
      ? "Likely continuation of previous thread."
      : "Potential new thread or check-in.";

  return {
    depthScore,
    depthLevel,
    dominantMood,
    topThemes: themes.slice(0, 3),
    continuityHint,
    unresolvedThread: unresolvedThread || "",
  };
}

function textToPayload(text, context) {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  if (!clean) return null;
  return {
    schemaVersion: "1.0",
    insight: "",
    question: clean.slice(0, 240),
    evidence: context.evidenceCandidates?.slice(0, 1) || [],
    confidence: 0.66,
    reasoning: "Model returned text instead of JSON; converted to safe payload.",
    fallback: false,
    currentFocus: context.blueprint?.depthLevel === "deep" ? "general_reflection" : "user_selected",
  };
}

// Distinct coaching voices, same idea as Stoic's "AI Mentors" -- previously
// Chat only ever had one fixed voice regardless of what someone actually
// wanted from a conversation. Only affects the AI-generated path (see the
// persona rules block in the prompt below); the rule-based fallback used
// when no AI provider is available/configured still uses its own fixed
// canned-question banks regardless of persona -- giving each persona its own
// full set of heuristic templates would be a much bigger, separate project,
// and the fallback path is already the degraded-experience case.
const PERSONAS = ["gentle", "stoic", "cbt"];

function normalizeChatSettings(raw = {}) {
  const mode = ["quick", "deep", "analysis"].includes(raw.mode) ? raw.mode : "quick";
  const responseStyle = Number.isFinite(raw.responseStyle)
    ? Math.max(0, Math.min(100, Number(raw.responseStyle)))
    : 50;
  const useMemory = raw.useMemory !== false;
  const persona = PERSONAS.includes(raw.persona) ? raw.persona : "gentle";
  return { mode, responseStyle, useMemory, persona };
}

function humanizeQuestion(question = "", focus = "general_reflection") {
  const cleaned = String(question || "").trim();
  if (!cleaned) return "I'm here with you. What feels most important to talk about right now?";
  const lower = cleaned.toLowerCase();
  if (/^hi\b|^hey\b/.test(lower)) return cleaned;

  // Widened from 2 options per focus to 3-4 -- two options meant a 50/50
  // coin flip on repeating the exact same lead within a couple of turns on
  // the same topic, which is common (most conversations stay on one focus
  // for several turns in a row), and a repeated lead reads as scripted.
  // Contractions throughout ("I'm" not "I am", "That's" not "That is") --
  // the stiffer full forms were a small but real part of why this read as
  // formal/clinical instead of like an actual friend texting back.
  const leadByFocus = {
    relationships: ["That sounds meaningful.", "I can feel this matters to you.", "That's clearly on your mind."],
    workload: ["That sounds draining.", "That's a lot to carry.", "No wonder that's wearing on you."],
    emotional_safety: ["I hear you.", "I'm really glad you shared that.", "Thank you for trusting me with that."],
    positive_state: ["I love hearing that.", "That's beautiful to hear.", "That's genuinely great to hear!"],
    // Previously unlisted, so every one of these focuses fell through to the
    // same general_reflection pair ("I hear you." / "Thanks for sharing
    // that.") -- fine on its own, but combined with the old "growth every
    // time" default-focus bug, it meant a long run of unrelated messages
    // could sound almost identical turn after turn.
    growth: ["That makes sense.", "Good, let's dig into that.", "I can see you're really thinking this through."],
    motivation: ["I get that.", "That's a real thing to sit with.", "A lot of people hit that same wall."],
    self_worth: ["That's worth sitting with for a second.", "I hear that.", "That sounds like a heavy thought to carry."],
    calm: ["Makes sense.", "Good to know.", "That's a good thing to notice about yourself."],
    creativity: ["I like that.", "That's worth exploring.", "There's something real there."],
    energy: ["That tracks.", "I hear you.", "That's a lot to run on empty with."],
    user_selected: ["Of course.", "No pressure.", "Sure thing."],
    general_reflection: ["I hear you.", "Thanks for sharing that.", "Appreciate you telling me that."],
  };
  const leads = leadByFocus[focus] || leadByFocus.general_reflection;
  const lead = leads[Math.floor(Math.random() * leads.length)];

  if (/^what\b|^which\b|^when\b|^how\b/.test(lower)) {
    return `${lead} ${cleaned}`;
  }
  return `${lead} ${cleaned}`;
}

// `ablation` is an opt-in, off-by-default parameter that exists solely to
// support the ablation study in scripts/evalAblation.js (see the paper's
// Reproducibility section) -- it lets that script measure what these two
// removed anti-patterns actually cost by deliberately re-enabling them on a
// real captured model payload, without touching production behavior. Every
// existing caller (routes.js, evalChatEngine.js, service.test.js) never
// passes it, so `ablation` is always `{}` there and this function's output
// is byte-for-byte identical to before these flags existed.
export function enrichPayload(payload, candidates, ablation = {}) {
  const enriched = {
    ...payload,
    evidence: normalizeEvidence(payload.evidence, candidates),
    insight: payload.insight || "",
    question: payload.question || "",
    reasoning: payload.reasoning || "",
    confidence: Number(payload.confidence || 0),
    currentFocus: payload.currentFocus || "general_reflection",
  };

  // Deliberately no evidence auto-fill here. Previously, whenever the model
  // returned an empty evidence array, this function substituted the user's
  // most recent journal entry as "evidence" regardless of whether it had
  // anything to do with the model's claim -- which meant the evidence-required
  // safety check below could never actually catch an unsupported claim for
  // any user who had written at least one journal entry. If the model made a
  // claim with no evidence, the honest outcome is a fallback, not a claim
  // dressed up with an unrelated citation.
  //
  // ablation.autoFillEvidence deliberately re-introduces exactly that removed
  // bug, gated behind an explicit opt-in flag never set in production, so the
  // eval-time ablation study can measure how often this anti-pattern would
  // have let an unsupported claim through.
  if (ablation.autoFillEvidence && enriched.evidence.length === 0 && candidates.length) {
    enriched.evidence = [candidates[0]];
  }

  if (!enriched.question) {
    enriched.question = "When this pattern appears, what thought usually shows up first for you?";
  }

  // Deliberately no confidence floor-boost here either. Previously, any
  // evidence at all (including the auto-filled evidence removed above) would
  // silently raise a low-confidence model response to at least 0.68 before
  // the confidenceOk check ran, which misrepresented the model's own
  // uncertainty to the user. A genuinely low-confidence response should now
  // correctly fail verifyInsight's confidenceOk check and fall back.
  //
  // ablation.boostConfidenceFloor is the same deliberate, opt-in-only
  // re-introduction of that second removed anti-pattern, for the same
  // ablation-study purpose as above.
  if (ablation.boostConfidenceFloor && enriched.evidence.length > 0 && enriched.confidence < 0.68) {
    enriched.confidence = 0.68;
  }

  enriched.question = humanizeQuestion(enriched.question, enriched.currentFocus);

  return enriched;
}

function detectTopicShift(userMessage) {
  const text = normalizeText(userMessage);
  return topicSwitchRegex.test(text);
}

export function detectIntent(userMessage) {
  const text = normalizeText(userMessage);
  const simpleOpenChat = /^(chat|talk|open chat|lets chat)$/.test(text);
  if (detectTopicShift(text)) return "topic_switch";
  if (clarificationRegex.test(text)) return "clarification";
  if (distressRegex.test(text)) return "distress_signal";
  if (/\b(helped|helping|supported|supporting|thankful|grateful)\b/.test(text)) return "gratitude";
  if (gratitudeRegex.test(text)) return "gratitude";
  if (relationshipRegex.test(text)) return "relationship_request";
  if (simpleOpenChat) return "open_chat";
  if (openChatRegex.test(text)) return "open_chat";
  if (greetingRegex.test(text)) return "greeting";
  if (genericChatRegex.test(text)) return "open_chat";
  if (uncertainRegex.test(text)) return "uncertain";
  if (affirmativeRegex.test(text)) return "affirmative";
  if (positiveRegex.test(text)) return "positive_checkin";
  return "reflection";
}

export function inferFocus(userMessage, themes = [], blocked = []) {
  const text = String(userMessage || "").toLowerCase();
  const mapped = [
    { focus: "workload", tokens: ["work", "meeting", "deadline", "office"] },
    { focus: "relationships", tokens: ["friend", "partner", "family", "relationship"] },
    { focus: "motivation", tokens: ["motivation", "stuck", "discipline", "goal"] },
    { focus: "self_worth", tokens: ["confidence", "self", "compare", "worth"] },
    { focus: "energy", tokens: ["tired", "exhausted", "sleep", "drained"] },
    { focus: "calm", tokens: ["calm", "peace", "relax", "mindful"] },
  ];

  const direct = mapped.find((m) => m.tokens.some((token) => text.includes(token)));
  if (direct && !blocked.includes(direct.focus)) return direct.focus;

  const themeToFocus = (theme) => {
    const t = String(theme || "").toLowerCase();
    if (/meeting|deadline|work|office|load/.test(t)) return "workload";
    if (/friend|family|partner|social|belong/.test(t)) return "relationships";
    if (/motivation|goal|discipline|stuck/.test(t)) return "motivation";
    if (/confidence|worth|compare|self/.test(t)) return "self_worth";
    if (/sleep|drain|tired|energy|fatigue/.test(t)) return "energy";
    if (/calm|mindful|ground|peace|reset/.test(t)) return "calm";
    if (/creative|idea|create/.test(t)) return "creativity";
    if (/growth|progress|intentional/.test(t)) return "growth";
    return null;
  };

  const inferredFromTheme = themes.map(themeToFocus).find((f) => f && !blocked.includes(f));
  if (inferredFromTheme) return inferredFromTheme;

  // Previously always returned "growth" (the first entry) whenever nothing
  // matched a keyword or theme -- since buildHeuristicResponse always calls
  // this with an empty blocked list, that first-match logic was actually
  // deterministic every single time, not just a fallback: any message with
  // no recognizable topic word ("which is", "going for a run", etc) landed
  // on the exact same "growth" focus/question no matter what was said.
  // Picking randomly among whatever isn't blocked gives real variety for
  // genuinely topic-less messages, while a real keyword/theme match above
  // still always wins first.
  const defaultFocuses = ["growth", "relationships", "motivation", "calm", "creativity"];
  const available = defaultFocuses.filter((f) => !blocked.includes(f));
  const pool = available.length ? available : defaultFocuses;
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildHeuristicPayload({ userMessage, candidates, themes, healthQuality, forceNewFocus, recentFocuses }) {
  // Previously bailed out to null here whenever there were zero journal
  // entries to cite as evidence -- which meant any brand-new account (or
  // anyone who cleared their journal history) got a real reply only for the
  // handful of exact-match intents in buildIntentPayload (greeting,
  // gratitude, etc), and the single hardcoded "brief connection issue" apology
  // for literally everything else, forever, regardless of what was typed.
  // inferFocus() already works fine with zero journal history (it reads the
  // message itself first, themes second), so there's no real reason a
  // focus-aware, varied reflective question needs journal evidence to exist.
  const hasEvidence = candidates.length > 0;
  const blocked = forceNewFocus ? recentFocuses : [];
  const focus = inferFocus(userMessage, themes, blocked);
  const top = candidates[0];
  const second = candidates[1] || candidates[0];
  const themeText = themes.length ? themes.slice(0, 2).join(" and ") : focus.replace(/_/g, " ");
  const healthHint = healthQuality.eligible
    ? " Your recent health trend also suggests the strain may be contextual rather than only sleep duration."
    : "";
  const questionByFocus = {
    workload: "What part of your day is costing you the most emotional energy right now?",
    relationships: "What interaction has stayed with you the longest today, and why?",
    motivation: "When motivation dips, what is the first signal you notice in your thoughts?",
    self_worth: "What moment recently made you question yourself, and what did it trigger?",
    calm: "What helps you feel grounded fastest when your mind gets noisy?",
    creativity: "What idea or activity has been calling for your attention lately?",
    growth: "What would meaningful progress look like for you this week?",
    energy: "When your energy drops, what pattern usually appears right before it?",
  };

  const patternPhrase = themeText === "energy" ? "energy regulation" : themeText;
  const isProblemSignal = problemSignalRegex.test(normalizeText(userMessage));
  // Expanded from 3 to 7 -- with only 3 openers, a longer conversation (the
  // heuristic path runs on every turn when no AI provider is reachable, not
  // just occasionally) had roughly a 1-in-3 chance of repeating the exact
  // same opener within just a couple of turns, which reads as canned rather
  // than as someone actually listening.
  const supportiveOpeners = [
    "I hear you.",
    "Thanks for sharing that.",
    "I'm with you on this.",
    "That makes sense.",
    "I appreciate you telling me that.",
    "Okay, I'm following.",
    "I get where you're coming from.",
  ];
  const opener = supportiveOpeners[Math.floor(Math.random() * supportiveOpeners.length)];
  // Previously "There may be a pattern around X" -- accurate, but reads like
  // a clinical note rather than something a friend would actually say.
  // Softened to plain conversational phrasing without changing what it's
  // claiming (still hedged, still only said when hasEvidence is true).
  const friendlyInsight = isProblemSignal && hasEvidence
    ? `${opener} It sounds like ${patternPhrase} keeps coming up for you.${healthHint}`
    : isProblemSignal
      ? `${opener} I don't have journal history to spot a pattern yet, but I'm listening.`
      : `${opener} We can keep this simple and talk through what matters most today.`;
  return {
    schemaVersion: "1.0",
    insight: friendlyInsight,
    question:
      questionByFocus[focus] ||
      "What feels most important to explore right now so this conversation is useful for you?",
    evidence: hasEvidence ? [top, second].slice(0, 2) : [],
    confidence: hasEvidence ? 0.67 : 0.6,
    reasoning: `Heuristic reflective synthesis generated ${hasEvidence ? "from recurring themes and recent journal evidence" : "without journal evidence (none written yet)"} for: "${userMessage}".`,
    fallback: !hasEvidence,
    currentFocus: focus,
  };
}

function buildIntentPayload({ intent, candidates }) {
  const evidence = candidates.length ? [candidates[0]] : [];
  if (intent === "greeting") {
    return {
      schemaVersion: "1.0",
      // insight left empty here (rather than a second "glad to see you"
      // line) since the question below already carries that warmth -- with
      // insight and question now shown together (see processChatTurn's
      // aiResponse combining), two back-to-back "good to see you" sentiments
      // would read as repetitive rather than extra-warm.
      insight: "",
      question: "Hey! Really glad you're here -- how are you feeling right now?",
      evidence,
      confidence: evidence.length ? 0.66 : 0,
      reasoning: "Greeting intent detected; using friend-like opener.",
      fallback: !evidence.length,
      currentFocus: "general_reflection",
    };
  }
  if (intent === "positive_checkin") {
    return {
      schemaVersion: "1.0",
      insight: "I love hearing that shift in your mood.",
      question: "What do you think made today feel better for you?",
      evidence,
      confidence: evidence.length ? 0.67 : 0,
      reasoning: "Positive check-in intent detected; reinforcing positive state.",
      fallback: !evidence.length,
      currentFocus: "positive_state",
    };
  }
  if (intent === "relationship_request") {
    return {
      schemaVersion: "1.0",
      insight: "Of course, let's focus on that.",
      question: "Tell me a little about what's happening in your relationships right now.",
      evidence,
      confidence: evidence.length ? 0.66 : 0,
      reasoning: "Direct relationship request detected.",
      fallback: !evidence.length,
      currentFocus: "relationships",
    };
  }
  if (intent === "gratitude") {
    return {
      schemaVersion: "1.0",
      insight: evidence.length ? "I can hear real appreciation and openness in what you shared." : "",
      question: "That's lovely. What part of this moment do you want to carry into tomorrow?",
      evidence,
      confidence: evidence.length ? 0.66 : 0.62,
      reasoning: "Gratitude intent detected.",
      fallback: !evidence.length,
      currentFocus: "positive_state",
    };
  }
  if (intent === "clarification") {
    return {
      schemaVersion: "1.0",
      insight: "",
      question:
        "I mean the moments, habits, or people that made you feel better today -- which one stands out most?",
      evidence: [],
      confidence: 0.64,
      reasoning: "Clarification intent detected.",
      fallback: true,
      currentFocus: "user_selected",
    };
  }
  if (intent === "uncertain") {
    return {
      schemaVersion: "1.0",
      insight: "",
      question: "No pressure at all -- we can start small. Mood, relationships, work, or energy?",
      evidence: [],
      confidence: 0.6,
      reasoning: "Uncertain intent detected; offering simple structured choices.",
      fallback: true,
      currentFocus: "user_selected",
    };
  }
  if (intent === "affirmative") {
    return {
      schemaVersion: "1.0",
      insight: "",
      question: "Great, let's keep it simple -- which one should we start with: mood, relationships, work, or energy?",
      evidence: [],
      confidence: 0.6,
      reasoning: "Affirmative short reply detected; prompting user to choose a clear direction.",
      fallback: true,
      currentFocus: "user_selected",
    };
  }
  if (intent === "distress_signal") {
    return {
      schemaVersion: "1.0",
      insight: "It sounds like things feel really heavy right now.",
      question: "I'm sorry you're carrying that. What feels strongest right now -- thoughts, body tension, or the situation itself?",
      evidence,
      confidence: evidence.length ? 0.67 : 0.62,
      reasoning: "Distress signal intent detected; using supportive non-medical grounding prompt.",
      fallback: false,
      currentFocus: "emotional_safety",
    };
  }
  if (intent === "open_chat" || intent === "topic_switch") {
    return {
      schemaVersion: "1.0",
      insight: "",
      question: "Sure, I'm all ears -- what do you feel like talking about now?",
      evidence: [],
      confidence: 0,
      reasoning: "User requested open chat/topic switch; prioritizing conversational flow.",
      fallback: true,
      currentFocus: "user_selected",
    };
  }
  return null;
}

function avoidRepeatedQuestion(payload, recentTurns = []) {
  if (payload.currentFocus === "user_selected") {
    return payload;
  }
  if (
    /how are you feeling right now/i.test(String(payload.question || "")) ||
    /quick check-in, a reflection prompt, or just an open chat/i.test(String(payload.question || ""))
  ) {
    return payload;
  }
  const recentResponses = recentTurns
    .slice(-5)
    .map((t) => String(t.aiResponse || "").toLowerCase().trim())
    .filter(Boolean);
  const current = String(payload.question || "").toLowerCase().trim();
  // A final reply is always `${randomLead} ${question}` (see humanizeQuestion)
  // -- comparing the bare candidate question against full past replies with
  // .includes() (substring), not ===, catches "same question, different
  // random lead" repeats. The previous exact-match check almost never fired,
  // since the odds of the *same* random lead getting picked twice in a row
  // are low, so the same core question could resurface a couple of turns
  // later wearing a different opener and sail right past this guard.
  const isRepeat = current && recentResponses.some((r) => r.includes(current));
  if (!isRepeat) return payload;

  const byFocus = {
    relationships: [
      "What interaction has stayed with you most this week?",
      "Which relationship feels easiest right now, and which feels heaviest?",
    ],
    workload: [
      "Which task pressure is affecting your mood the most today?",
      "What boundary would reduce today's work stress the fastest?",
    ],
    emotional_safety: [
      "Where do you feel this most strongly right now: mind, body, or both?",
      "What would help you feel 10% steadier in this moment?",
    ],
    positive_state: [
      "What do you want to repeat tomorrow from what worked today?",
      "What contributed most to this positive shift for you?",
    ],
    // Previously unlisted -- growth/motivation/self_worth/calm/creativity/
    // energy all fell straight to the same 4-item generic pool below, so any
    // two of those focuses hitting the repetition guard converged on
    // near-identical follow-ups regardless of how different their actual
    // topics were.
    growth: [
      "What's one small step that would move this forward?",
      "What's actually getting in the way of progress right now?",
    ],
    motivation: [
      "What usually pulls your motivation back once it dips?",
      "Is this more about willpower, or about the goal itself?",
    ],
    self_worth: [
      "Where do you think that inner voice originally came from?",
      "What would you say to a friend who felt this way about themselves?",
    ],
    calm: [
      "What does calm actually feel like in your body?",
      "What's one thing that reliably resets you when things feel like a lot?",
    ],
    creativity: [
      "What's stopping you from starting on that idea today?",
      "What would you make if it didn't have to be good?",
    ],
    energy: [
      "Is this more physical tiredness, or mental fatigue?",
      "What's the earliest sign your energy is about to drop?",
    ],
  };
  const generic = [
    "What feels most important for us to unpack right now?",
    "If you had to name the main feeling in one word, what would it be?",
    "What happened right before this feeling became stronger?",
    "What would make this conversation most useful for you today?",
    "What's underneath this, if you had to guess?",
    "Is there anything about this you haven't said out loud yet?",
  ];
  const alternatives = [...(byFocus[payload.currentFocus] || []), ...generic];
  const nextQuestion =
    alternatives.find((q) => !recentResponses.some((r) => r.includes(q.toLowerCase()))) || alternatives[0];
  return {
    ...payload,
    question: humanizeQuestion(nextQuestion, payload.currentFocus),
    reasoning: `${payload.reasoning} Repetition guard replaced repeated prompt.`.trim(),
  };
}

function buildContextFollowUp({ userMessage, sessionTurns = [] }) {
  if (!sessionTurns.length) return null;
  const text = normalizeText(userMessage);
  const lastTurn = sessionTurns[sessionTurns.length - 1];
  const lastAi = String(lastTurn?.aiResponse || "").toLowerCase();

  if (affirmativeRegex.test(text) && /mood, relationships, work, or energy/.test(lastAi)) {
    return {
      schemaVersion: "1.0",
      insight: "",
      question: "Great. Pick one to start: mood, relationships, work, or energy.",
      evidence: [],
      confidence: 0.62,
      reasoning: "Follow-up clarification after menu-style prompt.",
      fallback: true,
      currentFocus: "user_selected",
    };
  }

  if (
    /relationship|friend|friends|friendship|miss|lost a friend|best friend|partner|family/.test(text) &&
    /relationship dynamic has been on your mind/.test(lastAi)
  ) {
    return {
      schemaVersion: "1.0",
      insight: "I can hear that this connection matters a lot to you.",
      question: "What do you miss most about that friend right now?",
      evidence: [],
      confidence: 0.64,
      reasoning: "Relationship deepening follow-up to avoid repeating the same prompt.",
      fallback: false,
      currentFocus: "relationships",
    };
  }

  if (
    /what worked today|what worked yesterday|what do you mean|can you explain|what worked/.test(text) &&
    /repeat tomorrow from what worked today|made today feel better/.test(lastAi)
  ) {
    return {
      schemaVersion: "1.0",
      insight: "Great question.",
      question:
        "I mean the moments, habits, or people that made you feel lighter today. What is one thing you would repeat?",
      evidence: [],
      confidence: 0.66,
      reasoning: "Clarification follow-up for positive-state prompt.",
      fallback: false,
      currentFocus: "positive_state",
    };
  }

  if (
    /friend|helped|kind|support|grateful|thankful/.test(text) &&
    /made today feel better|repeat tomorrow from what worked today|carry into tomorrow|positive shift/.test(lastAi)
  ) {
    return {
      schemaVersion: "1.0",
      insight: "That's really meaningful and kind of you.",
      question: "How did helping them make you feel afterward?",
      evidence: [],
      confidence: 0.66,
      reasoning: "Positive-thread follow-up after gratitude response.",
      fallback: false,
      currentFocus: "positive_state",
    };
  }

  return null;
}

// Note: deliberately not matching the bare word "rest" (too common in
// non-health sentences, e.g. "the rest of my day") -- only the more
// specific health-adjacent phrasings.
//
// Kept as a source string, not a shared RegExp instance: this pattern is
// used both with .replace() (scrub, below) and .test() (verifyInsight).
// A single RegExp object with the "g" flag is stateful across calls
// (lastIndex persists on the object between .test() invocations), which
// would risk verifyInsight silently missing a match depending on what the
// same object's previous .replace()/.test() call happened to leave behind.
// Building a fresh RegExp per call sidesteps that entirely.
const HEALTH_KEYWORD_SOURCE =
  "\\b(sleep|stress|heart rate|heart|steps|activity|recovery|rest pattern|resting|screen time|movement pattern|energy level|sedentary)\\b";

export function scrubHealthReferences(payload) {
  const scrub = (text) =>
    String(text || "")
      .replace(new RegExp(HEALTH_KEYWORD_SOURCE, "gi"), "energy pattern")
      .replace(/\s+/g, " ")
      .trim();

  return {
    ...payload,
    insight: scrub(payload.insight),
    question: scrub(payload.question),
    reasoning: scrub(payload.reasoning),
  };
}

// llama3.2:3b reliably passes schema validation (confidence is typeof
// number) but has been empirically observed -- even with an explicit prompt
// instruction and a non-zero example value -- to still emit a literal 0 for
// confidence. That's almost certainly a structured-output formatting
// artifact of this specific small model under Ollama's forced "format:
// json" grammar, not a genuine "I'm not sure" signal: the prompt's own rule
// is that real uncertainty should show up as fallback=true, so a model that
// has already committed to fallback=false while citing real, evidence-
// matched grounding but reports confidence=0 is contradicting itself in one
// field only. Recovering that one broken field from a signal we can already
// trust (whether real evidence was returned, per the evidence-matching fix
// above) is not the "confidence floor-boost" anti-pattern removed elsewhere
// in this file -- that boosted a genuinely low model-reported confidence.
// This only fires when the number is clearly broken (<=0) on an explicit
// fallback=false claim with real evidence attached; a fallback=false claim
// with no evidence still correctly fails verifyInsight's evidencePresent
// check regardless.
function recoverOllamaConfidence(payload) {
  if (
    payload.fallback === false &&
    (!Number.isFinite(payload.confidence) || payload.confidence <= 0) &&
    Array.isArray(payload.evidence) &&
    payload.evidence.length > 0
  ) {
    return { ...payload, confidence: 0.72 };
  }
  return payload;
}

async function generateInsightWithOllama(prompt) {
  const response = await fetchWithTimeout(
    `${ollamaBaseUrl}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ollamaAuthHeaders },
      body: JSON.stringify({
        model: ollamaModel,
        stream: false,
        format: "json",
        // keep_alive: previously unset, which uses Ollama's default 5-minute
        // idle unload -- fine for occasional real-user traffic, but during a
        // batch eval run (see scripts/evalChatEngine.js) or any burst of
        // chat turns more than 5 minutes apart, the model gets evicted from
        // memory and the next call pays a full reload before it can even
        // start generating, on top of normal inference time. Keeping it
        // resident for 30 minutes removes that reload tax from every call
        // after the first in a session/eval run, with no effect on output.
        keep_alive: "30m",
        options: {
          temperature: 0.2,
          // num_predict: previously unset (Ollama's default is effectively
          // unbounded generation length). The prompt's own rules already cap
          // insight/question to <=28/<=24 words each, so a valid response is
          // always short -- but with no cap, a model that fails to emit a
          // closing brace (or drifts into repetition, which small local
          // models occasionally do) keeps generating tokens with nothing to
          // stop it until the request eventually times out. 320 tokens is
          // generously above what a schema-conformant JSON response needs
          // (short insight + question + up to 5 short evidence quotes +
          // reasoning), so this only ever cuts off runaway generations, not
          // normal ones -- it does not change the accept/reject policy.
          num_predict: 320,
        },
        messages: [
          {
            role: "system",
            content:
              "Return strict JSON only. No markdown, no explanations, no prose outside JSON.",
          },
          { role: "user", content: prompt },
        ],
      }),
    },
    // fetchWithTimeout's shared default is 20000ms. Deep/analysis-mode
    // prompts are longer and, on a CPU-bound local 3B model under real
    // load, occasionally run past that -- which previously counted as a
    // hard failure (falls through to attempt 2, then heuristic/fallback)
    // even though the model would have produced a real, valid answer given
    // a few more seconds. This only widens the network-timeout budget for
    // this one call site; it does not touch the accept/reject policy
    // (evidence/confidence/health checks) at all, and the Vitest suite runs
    // with USE_OLLAMA=false so it never exercises this code path.
    30000,
  );

  if (!response.ok) {
    throw new AppError("AI_PARSE_FAILED", `Ollama request failed with status ${response.status}`, 502);
  }

  const data = await response.json();
  const text = String(data?.message?.content || "").replace(/```json|```/g, "").trim();
  const parsed = parseJsonSafe(text);
  if (validateAiPayload(parsed)) {
    logInfo("Ollama generated a valid response", { ollamaModel });
    return recoverOllamaConfidence(parsed);
  }
  const coerced = coerceAiPayload(parsed);
  if (!coerced) {
    throw new AppError("AI_PARSE_FAILED", "Ollama response could not be normalized", 502);
  }
  logInfo("Ollama generated a response (coerced to schema)", { ollamaModel });
  return recoverOllamaConfidence(coerced);
}

// Shared by both cloud providers below -- Gemini's OpenAI-compat shim only
// implements the classic chat.completions endpoint, while real OpenAI now
// prefers its newer Responses API, so `useResponsesApi` picks the right SDK
// call shape per provider. Returns null (not a thrown error) when the
// response came back but couldn't be parsed/coerced into a valid payload --
// that's a "try the next provider" outcome, not a network/auth failure.
async function generateInsightWithCloud(client, { model, temperature, useResponsesApi, source }, prompt, context) {
  let text = "";
  if (useResponsesApi) {
    const result = await client.responses.create({
      model,
      input: prompt,
      temperature,
      max_output_tokens: CLOUD_MAX_OUTPUT_TOKENS,
    });
    text = String(result.output_text || "").replace(/```json|```/g, "").trim();
  } else {
    const result = await client.chat.completions.create({
      model,
      temperature,
      max_tokens: CLOUD_MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    text = String(result.choices?.[0]?.message?.content || "").replace(/```json|```/g, "").trim();
  }
  const parsed = parseJsonSafe(text);
  if (validateAiPayload(parsed)) return { payload: parsed, source };
  const coerced = coerceAiPayload(parsed);
  if (coerced) return { payload: coerced, source };
  const textPayload = textToPayload(text, context);
  if (textPayload) return { payload: textPayload, source };
  return null;
}

function geminiTemperature(context) {
  const mode = context.settings?.mode || "quick";
  const style = Number(context.settings?.responseStyle ?? 50);
  return mode === "analysis" ? 0.45 : mode === "deep" ? 0.62 : style < 40 ? 0.58 : 0.5;
}

async function generateInsight(context, userMessage) {
  // Every configured provider, in cost-ordered priority: Ollama Cloud/local
  // first (cheapest, already the default), then Gemini, then OpenAI. Each
  // one that has a key gets a real attempt -- this used to hard-pick at most
  // one cloud provider at startup (whichever key happened to be set), so
  // configuring both OPENAI_API_KEY and GEMINI_API_KEY silently ignored
  // Gemini's. Now all three degrade into each other in order.
  const providers = [
    useOllama && { name: "ollama" },
    geminiClient && { name: "gemini", client: geminiClient, model: geminiModel, useResponsesApi: false },
    openaiClient && { name: "openai", client: openaiClient, model: openaiModel, useResponsesApi: true },
  ].filter(Boolean);
  if (providers.length === 0) {
    throw new AppError("AI_PARSE_FAILED", "AI key missing; AI generation unavailable", 502);
  }
  const prompt = `
You are ReflectAI: part reflective non-medical coach, part genuine conversational companion. You do not need a therapy angle on every single message -- sometimes the user just wants to chat, and that is a completely normal, welcome thing to do here, not a detour from your "real" job.
Return ONLY valid JSON with this exact shape:
{
  "schemaVersion":"1.0",
  "insight":"string",
  "question":"string",
  "evidence":[{"journalId":"string","quote":"string","date":"ISO date"}],
  "confidence":0.78,
  "reasoning":"string",
  "fallback":false,
  "currentFocus":"string"
}
Rules:
- Never diagnose, never give medical advice, never prescribe solutions.
- Ask open-ended Socratic question. But this is a conversation, not an interview: the insight and question together should read as ONE natural reply a caring friend would actually say out loud, not "clinical observation. Then: formal probing question?" Phrase the question the way a genuinely curious friend would ask it in conversation, not the way a therapist opens an intake form.
- Sound genuinely friendly, not just "supportive" in the abstract: use contractions (I'm, that's, you're, don't -- never the stiff full forms I am/that is/you are/do not), casual everyday phrasing over formal or therapy-coded language ("that sounds rough" over "that sounds worth pausing on"), and let real warmth or excitement come through when it fits (an occasional exclamation mark for good news is fine, this doesn't need to stay flat and neutral every time).
- Use at least one evidence object from evidenceCandidates when fallback=false.
- If evidence is weak, set fallback=true and keep insight empty.
- confidence is REQUIRED and must be your real, calibrated certainty as a number strictly between 0 and 1 (never 0, never exactly the 0.78 shown in the shape above -- that is only an example of the format, not a value to copy). If fallback=false, confidence must be at least 0.65, since fallback=false is itself a claim that you are reasonably certain. If you are not that certain, set fallback=true instead of writing a low confidence number.
- If user requests topic shift, do not repeat prior focus.
- Sound human, warm, and natural (like a supportive friend), not robotic or clinical. Never sound stern, formal, or like you're running a checklist -- warmth is the default, not an occasional garnish on top of an otherwise clinical reply.
- Keep wording simple and conversational. Avoid corporate phrases and avoid repeating the same sentence patterns.
- Start from empathy first, then one clear reflective question -- but let the two blend into one natural thought (e.g. "That sounds like a lot to carry -- what's been weighing on you most?"), not two disconnected sentences bolted together.
- Never ask more than one main question per turn.
- Keep question under 24 words.
- Keep insight under 28 words.
- If user says only a short opener like "hi", respond with a friendly check-in question.
- If user says "chat", "lets talk", or "open chat", do NOT force a theme; invite free conversation.
- If the message is ordinary small talk or a generic question not about the user's own feelings/journal (e.g. "what's up", asking your opinion, a fact, a joke, chatting about a hobby, pop culture, or anything else two people might casually talk about), just respond like a normal, friendly conversation partner would -- answer it, react to it, banter a little if it fits. You do NOT need to redirect this back to reflection, cite evidence, or force an emotional/probing question onto it. Set fallback=true and evidence=[] for a purely generic reply like this (there is nothing personal to ground), and let the "question" field just be your natural conversational reply -- it does not have to literally be a question every time; "question" here just means "what you say back," even if it's a statement, a joke, or an answer to what they asked.
- If user says "something else" or asks topic switch, acknowledge and ask what they want to discuss now.
- If user asks clarification ("what worked today?", "what do you mean?"), clarify the previous question in plain language.
- Mirror and validate emotion before analysis.
- Use Socratic "gentle nudges", never commands.
- Use long-term memory naturally when relevant: mention old patterns without sounding creepy.
- If context.blueprint.depthLevel is "deep", switch to deeper analysis while keeping a friend-like tone.
- If distress is severe, pivot to supportive grounding language first (safety valve), then one gentle question.
- Respect context.settings:
  - mode="quick": keep it light and short.
  - mode="deep": go deeper and more emotionally precise.
  - mode="analysis": emphasize pattern analysis with warm tone.
  - useMemory=false: do not reference old journals or prior sessions.
  - responseStyle in [0..100]: lower means softer friend-like, higher means more analytical but still humane.
  - persona is a voice/style overlay on top of mode above -- it changes HOW you talk, not the JSON shape or the safety rules:
    - persona="gentle" (default): warm, soft, validating -- a gentle listener. Emotion first, minimal challenge.
    - persona="stoic": calmer and more direct. Draw on Stoic-style reframing -- separate what's in the user's control from what isn't -- while staying warm, never cold, preachy, or lecturing.
    - persona="cbt": before the question, offer one gentle CBT-style reframe of any all-or-nothing/catastrophizing language you notice in their message, stated as a genuine observation, not a correction.
- Mode output guardrails (MUST):
  - quick: one short friendly check-in question, no heavy analysis language.
  - deep: include one emotionally validating sentence + one deeper pattern question.
  - analysis: explicitly mention one observed pattern/trend before the question.
- Use context.blueprint.depthLevel to adapt tone:
  - "light": casual chat tone, short and easy.
  - "reflective": warm reflective tone with one gentle question.
  - "deep": emotionally precise, reference continuity from prior journals/session when relevant.
- Keep language human and natural, like a thoughtful friend.

Context:
${JSON.stringify(context)}

User message:
${userMessage}
`;

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const provider of providers) {
      try {
        if (provider.name === "ollama") {
          const result = await generateInsightWithOllama(prompt);
          return { payload: result, source: "ollama" };
        }
        const result = await generateInsightWithCloud(
          provider.client,
          {
            model: provider.model,
            temperature: provider.name === "gemini" ? geminiTemperature(context) : openaiTemperature,
            useResponsesApi: provider.useResponsesApi,
            source: provider.name,
          },
          prompt,
          context,
        );
        if (result) return result;
        // Response came back but couldn't be turned into a valid payload --
        // move on to the next provider rather than retrying the same one.
      } catch (error) {
        // Previously a bare `catch {}` on the Ollama branch specifically --
        // the real reason a provider failed (connection refused, bad JSON,
        // model not found, non-2xx status, rate limit) was discarded and
        // never visible anywhere. Now logged for every provider, then falls
        // through to the next one in the list.
        lastError = error;
        logError(`${provider.name} generation attempt failed`, {
          attempt: attempt + 1,
          provider: provider.name,
          ...(provider.name === "ollama" ? { ollamaBaseUrl, ollamaModel } : { model: provider.model }),
          error: error?.message || String(error),
        });
      }
    }
  }
  if (lastError?.status === 429 || /429/.test(String(lastError?.message || ""))) {
    throw new AppError("AI_RATE_LIMITED", "AI provider rate limit reached", 429);
  }
  throw new AppError("AI_PARSE_FAILED", "AI response could not be parsed", 502);
}

export function verifyInsight({ payload, rawText, healthQuality, ablation = {} }) {
  // Evidence/confidence should only be required when the model is actually
  // asserting something about the user's patterns (a non-empty `insight`) --
  // not for a plain conversational turn (fallback=false, insight="") like a
  // warm follow-up question to "lets start from my morning." Previously ANY
  // fallback=false turn required evidence, which meant completely ordinary
  // small talk with no claim to ground -- exactly what the prompt's own
  // rules tell the model to give for greetings/casual openers -- was
  // rejected every single time and silently replaced with the generic
  // fallback question, even though the model behaved correctly. This was
  // caught live: real chat turns coming back fallback:false, evidence: [],
  // insight: "" and still failing verification on every casual message.
  //
  // ablation.requireEvidenceUnconditionally deliberately restores that
  // earlier, less-precise gate (evidence/confidence required on every
  // fallback=false turn regardless of whether a claim was made), gated
  // behind an explicit opt-in flag never set in production. It exists only
  // so the eval-time ablation study can measure the usability cost of the
  // unconditional version -- see scripts/evalAblation.js.
  const hasInsightClaim = ablation.requireEvidenceUnconditionally
    ? !payload.fallback
    : !payload.fallback && String(payload.insight || "").trim().length > 0;
  const decisions = {
    evidencePresent: hasInsightClaim ? payload.evidence.length > 0 : true,
    confidenceOk: hasInsightClaim ? payload.confidence >= policyConfig.minConfidence : true,
    healthClaimsEligible: true,
  };

  // Checked against rawText (the model's ORIGINAL, pre-scrub wording), not
  // payload.insight/question. Previously this checked the already-scrubbed
  // text using nearly the same keyword list scrubHealthReferences had just
  // applied -- so every word this check looked for had already been
  // replaced with "energy pattern" before it ran, meaning
  // healthClaimsEligible could never actually be set to false. Checking the
  // raw text closes that gap: an ineligible health claim now fails this
  // check regardless of how scrub subsequently rewrote it.
  const usesHealth = new RegExp(HEALTH_KEYWORD_SOURCE, "i").test(rawText || "");
  if (usesHealth && !healthQuality.eligible) decisions.healthClaimsEligible = false;

  const accepted = decisions.evidencePresent && decisions.confidenceOk && decisions.healthClaimsEligible;
  return { accepted, decisions };
}

export async function buildChatContext(userId) {
  // These four reads are independent of one another (none depends on
  // another's result), so they previously ran as four sequential awaits --
  // each one paying a full Mongo round-trip before the next even started.
  // Running them concurrently cuts buildChatContext's latency to roughly
  // that of the single slowest query instead of the sum of all four, with
  // no change in what's fetched or returned.
  // journals also now selects the embedding field (`+embedding`, normally
  // excluded -- see JournalEntry.js) so buildSmartEvidenceCandidates below
  // can reuse this same result set for semantic matching instead of
  // re-querying JournalEntry a second time for the same 20 documents.
  // visibleJournalFilter excludes time-capsule entries not yet due -- this is
  // the most severe instance of this bug: without it, a sealed capsule's
  // content could be pulled in as evidence and the AI could quote or
  // paraphrase it straight back to the user in a chat reply, before its
  // reveal date.
  const [journals, retrospect, health, session] = await Promise.all([
    JournalEntry.find(visibleJournalFilter({ userId })).sort({ createdAt: -1 }).limit(20).select("+embedding"),
    RetrospectAnalysis.findOne({ userId }).sort({ createdAt: -1 }),
    HealthData.find({
      userId,
      date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }).sort({ date: -1 }),
    ChatSession.findOne({ userId }),
  ]);
  const themes = detectThemes(journals);
  const healthQuality = calculateHealthQuality(health);
  const readiness = buildReadiness({ journals, healthQuality, themes });

  return {
    journals,
    retrospect,
    health,
    session,
    themes,
    healthQuality,
    readiness,
  };
}

// Rule-based responder used both when no AI provider is configured at all,
// and as a graceful degrade when a configured provider's call fails for any
// non-rate-limit reason. Was already fully written (detectIntent /
// buildContextFollowUp / buildIntentPayload / buildHeuristicPayload /
// avoidRepeatedQuestion) but only ever wired into the "no provider" branch --
// giving real, varied, on-brand responses in both cases instead of the one
// hardcoded apology line every AI-call failure used to fall back to.
export function buildHeuristicResponse({ userMessage, context, evidenceCandidates }) {
  const recentTurns = context.session?.turns || [];
  const intent = detectIntent(userMessage);
  let payload =
    buildContextFollowUp({ userMessage, sessionTurns: recentTurns }) ||
    buildIntentPayload({ intent, candidates: evidenceCandidates }) ||
    buildHeuristicPayload({
      userMessage,
      candidates: evidenceCandidates,
      themes: context.themes,
      healthQuality: context.healthQuality,
      forceNewFocus: false,
      recentFocuses: [],
    });
  if (payload) payload = avoidRepeatedQuestion(payload, recentTurns);
  return payload;
}

export async function processChatTurn({ userId, userMessage, chatSettings = {}, ablation = {} }) {
  const normalizedSettings = normalizeChatSettings(chatSettings);
  const context = await buildChatContext(userId);
  const journalPool = normalizedSettings.useMemory ? context.journals : [];
  const evidenceCandidates = await buildSmartEvidenceCandidates(userId, journalPool, userMessage, "reflection");
  const blueprint = buildLongitudinalBlueprint({
    userMessage,
    journals: journalPool,
    themes: context.themes,
    sessionTurns: context.session?.turns || [],
    mode: normalizedSettings.mode,
  });
  let payload = null;
  let parseFailed = false;
  let responseSource = "fallback";
  // Captures the model's own, pre-policy output (before enrichPayload
  // touches it) whenever generation actually succeeds -- exposed on the
  // return value below so scripts/evalAblation.js can replay the same real
  // generated payload through an alternate (ablated) policy pipeline without
  // making a second, independently-stochastic model call. Stays null on the
  // heuristic/no-provider/total-failure paths, since those never produced a
  // raw model payload in the first place.
  let rawGeneratedPayload = null;
  const aiAvailable = !!geminiClient || !!openaiClient || useOllama;

  if (aiAvailable) {
    try {
      // Previously also sent the full `journals` pool here (up to 20 raw
      // entries, full content, in addition to evidenceCandidates below) --
      // the prompt's own rules only ever tell the model to cite from
      // `evidenceCandidates` ("Use at least one evidence object from
      // evidenceCandidates when fallback=false"), never from a separate
      // `journals` field, so that raw pool was pure prompt bloat: up to 20x
      // full journal entries JSON-stringified into every single request,
      // directly inflating prefill time on a CPU-bound local 3B model for
      // no behavioral benefit. `evidenceCandidates` (already the
      // relevance-scored top 5, semantic-matched when available) plus
      // `themes` and `latestRetrospect` still give the model everything it
      // needs for both specific citations and longer-term pattern context.
      // Nothing downstream reads this payload's `journals` field -- removing
      // it does not change evidence matching, gating, or any accept/reject
      // policy decision, only how many tokens get sent to the model.
      const generated = await generateInsight(
        {
          evidenceCandidates,
          themes: context.themes,
          latestRetrospect: context.retrospect?.summary || "",
          healthQuality: context.healthQuality,
          blueprint,
          settings: normalizedSettings,
          lastAssistantQuestion: String((context.session?.turns || []).slice(-1)[0]?.aiResponse || ""),
          normalizedUserMessage: normalizeText(userMessage),
        },
        userMessage,
      );
      rawGeneratedPayload = generated.payload;
      payload = enrichPayload(generated.payload, evidenceCandidates, ablation);
      // Same repetition guard already applied to heuristic replies (see
      // buildHeuristicResponse below) -- previously only that rule-based path
      // got it, so a genuine Ollama/cloud reply could ask the near-same
      // question turn after turn on the same focus with nothing catching it.
      // Confirmed live: real transcripts showed "What do you think is missing
      // from your social life..." twice in a row once the fallback-loop bug
      // (verifyInsight) was fixed and AI replies started flowing through.
      payload = avoidRepeatedQuestion(payload, context.session?.turns || []);
      responseSource = generated.source;
    } catch (error) {
      parseFailed = true;
      payload = null;
      responseSource = "fallback";
      const rateLimited =
        error?.code === "AI_RATE_LIMITED" ||
        error?.statusCode === 429 ||
        /rate limit|429/i.test(String(error?.message || ""));
      if (rateLimited) {
        payload = fallbackPayload({
          question:
            "I'm still here with you -- just a little overloaded for a moment. Mind trying again in about a minute?",
          insight: "",
          evidence: [],
          currentFocus: "user_selected",
          reasoning: "Minimal non-rule fallback due to upstream rate limiting.",
        });
      } else {
        // Previously any non-rate-limit failure here (invalid/placeholder API
        // key, expired key, provider outage, network error) left `payload`
        // null, which always fell through to the single hardcoded "I had a
        // brief connection issue" line below -- every turn, regardless of
        // what was typed, forever, since a bad key never becomes a good key
        // on retry. The same rule-based responder used below for "no AI
        // configured at all" degrades this the same way: a real, varied,
        // on-brand reply instead of an infinite loop of one apology.
        payload = buildHeuristicResponse({ userMessage, context, evidenceCandidates });
        if (payload) responseSource = "heuristic";
      }
    }
  } else {
    // No AI provider configured at all (no OpenAI/Gemini key, USE_OLLAMA=false).
    payload = buildHeuristicResponse({ userMessage, context, evidenceCandidates });
    if (payload) responseSource = "heuristic";
  }

  if (!payload) {
    payload = fallbackPayload({
      question: "I'm here with you -- just had a brief connection hiccup. Mind sending that once more?",
      insight: "",
      evidence: [],
      currentFocus: "user_selected",
      reasoning: "Minimal non-rule fallback after model generation failure.",
    });
    responseSource = "fallback";
  }

  // Captured BEFORE scrub runs, so verifyInsight's health-eligibility check
  // below inspects what the model actually said, not text that scrub may
  // have already sanitized. Checking the post-scrub text would let every
  // ineligible health claim pass, since scrub replaces the exact words the
  // check looks for.
  const rawText = `${payload.insight || ""} ${payload.question || ""}`;

  if (!context.healthQuality.eligible && !payload.fallback) {
    payload = scrubHealthReferences(payload);
  }

  const verification = verifyInsight({ payload, rawText, healthQuality: context.healthQuality, ablation });
  const accepted = verification.accepted;
  // Only logs the rejection case, not every turn -- added during the
  // original "why is everything falling back" investigation, when logging
  // unconditionally was the right call for visibility into a completely
  // silent failure. Now that the underlying bugs are fixed and verified,
  // an accepted turn is the expected/uninteresting case; a rejected one is
  // still worth a log line to see why (evidence, confidence, or health-
  // eligibility) without a log line on every single message sent.
  if (!accepted) {
    logInfo("Chat turn rejected by verification", {
      responseSource,
      decisions: verification.decisions,
      payloadFallback: payload.fallback,
      evidenceCount: (payload.evidence || []).length,
      confidence: payload.confidence,
    });
  }
  const finalPayload = accepted ? payload : fallbackPayload();
  finalPayload.source = accepted ? responseSource : "fallback";
  finalPayload.chatSettings = normalizedSettings;

  // Previously only `finalPayload.question` was persisted as aiResponse --
  // `insight` (the empathetic/validating line the prompt explicitly asks
  // for, e.g. "That sounds draining." before the question) was generated on
  // every turn and then silently dropped here, so it never made it into chat
  // history at all, and the client's live POST response had the same gap
  // (see ChatPage.jsx's message-send handler). Combining once here, before
  // both the audit log's generatedQuestion and appendChatTurn below, is the
  // single place both a live reply and every future GET /session load derive
  // their displayed text from, so a page reload shows the same warmer text
  // as the live turn did, not the bare question it used to fall back to.
  finalPayload.aiResponse =
    [finalPayload.insight, finalPayload.question].filter(Boolean).join(" ").trim() || finalPayload.question;

  const audit = await AuditLog.create({
    userId,
    triggerReason: "chat_turn",
    retrievedMemoryIds: context.journals.map((j) => j._id.toString()),
    detectedPatterns: context.themes,
    evidenceIds: (payload.evidence || []).map((e) => String(e.journalId || "")),
    generatedQuestion: finalPayload.question,
    confidence: finalPayload.confidence,
    policyDecisions: {
      ...verification.decisions,
      parseFailed,
      responseSource: finalPayload.source,
      healthQuality: context.healthQuality,
      chatSettings: normalizedSettings,
    },
    status: accepted ? "accepted" : "rejected",
    policyVersion: policyConfig.policyVersion,
  });

  if (!audit?._id) {
    throw new AppError("AUDIT_WRITE_FAILED", "Audit write failed", 500);
  }

  const session = await appendChatTurn(userId, {
    userMessage,
    aiResponse: finalPayload.aiResponse,
    evidence: finalPayload.evidence,
    confidence: finalPayload.confidence,
    fallback: finalPayload.fallback,
    reasoning: finalPayload.reasoning,
    focus: finalPayload.currentFocus || "general_reflection",
    createdAt: new Date(),
  });

  return {
    payload: finalPayload,
    readiness: context.readiness,
    themes: context.themes,
    healthQuality: context.healthQuality,
    session,
    // Additive fields, not used by any existing caller (routes.js just reads
    // `payload`): accepted mirrors verification.accepted, and
    // rawGeneratedPayload/evidenceCandidates expose exactly what
    // scripts/evalAblation.js needs to replay this same real turn through an
    // alternate policy configuration.
    accepted,
    rawGeneratedPayload,
    evidenceCandidates,
  };
}

