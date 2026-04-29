import OpenAI from "openai";
import AuditLog from "../../models/AuditLog.js";
import ChatSession from "../../models/ChatSession.js";
import HealthData from "../../models/HealthData.js";
import JournalEntry from "../../models/JournalEntry.js";
import RetrospectAnalysis from "../../models/RetrospectAnalysis.js";
import { env, policyConfig } from "../../shared/config/env.js";
import { AppError } from "../../shared/utils/AppError.js";

const geminiModel = env.GEMINI_MODEL || "gemini-2.0-flash";
const openaiModel = env.OPENAI_MODEL || env.AI_MODEL || "gpt-4.1-mini";
const openaiFallbackMode = String(env.OPENAI_FALLBACK_MODE || "manual").toLowerCase();
const useOllama = String(env.USE_OLLAMA || "true").toLowerCase() !== "false";
const ollamaBaseUrl = env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const ollamaModel = env.OLLAMA_MODEL || "llama3.2:3b";
const geminiClient = env.GEMINI_API_KEY
  ? new OpenAI({
      apiKey: env.GEMINI_API_KEY,
      timeout: 12000,
      maxRetries: 1,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    })
  : null;
const openaiClient = env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: 12000,
      maxRetries: 1,
    })
  : null;
const fallbackTemplates = [
  "I might be missing context, so I do not want to assume. What feels most important for you right now?",
  "I want to understand you properly. Which part of this should we explore first?",
  "Thank you for sharing that. What feels heaviest or most important in this moment?",
  "I am here with you. Where would you like to begin?",
];

const topicSwitchRegex =
  /\b(something else|different topic|change topic|not this|stop talking about|move on|new topic|talk about something else)\b/i;
const greetingRegex = /\b(hi|hello|hey|yo|good morning|good evening)\b/i;
const positiveRegex = /\b(happy|great|good|excited|grateful|better|awesome|nice)\b/i;
const positiveOutcomeRegex =
  /\b(passed|pass|did well|went well|succeeded|success|nailed|aced|completed|finished|cleared|won)\b/i;
const openChatRegex =
  /\b(let'?s talk|let us talk|open chat|free talk|just chat|talk about anything|random talk)\b/i;
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

function calculateHealthQuality(healthRecords) {
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
    quote: j.content.slice(0, 220),
    date: j.createdAt,
    mood: j.mood,
  }));
}

function normalizeEvidence(evidence, candidates) {
  if (!Array.isArray(evidence)) return [];
  const byId = new Map(candidates.map((c) => [c.journalId, c]));
  return evidence
    .map((ev) => {
      const matched = byId.get(String(ev.journalId || ""));
      if (matched) {
        return {
          journalId: matched.journalId,
          quote: ev.quote || matched.quote,
          date: ev.date || matched.date,
        };
      }
      return null;
    })
    .filter(Boolean);
}

function validateAiPayload(payload) {
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

function coerceAiPayload(rawPayload) {
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

function buildLongitudinalBlueprint({ userMessage, journals = [], themes = [], sessionTurns = [], mode = "quick" }) {
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

export function normalizeChatSettings(raw = {}) {
  const mode = ["quick", "deep", "analysis"].includes(raw.mode) ? raw.mode : "quick";
  const responseStyle = Number.isFinite(raw.responseStyle)
    ? Math.max(0, Math.min(100, Number(raw.responseStyle)))
    : 50;
  const useMemory = raw.useMemory !== false;
  return { mode, responseStyle, useMemory };
}

function humanizeQuestion(question = "", focus = "general_reflection") {
  const cleaned = String(question || "").trim();
  if (!cleaned) return "I am here with you. What feels most important to talk about right now?";
  const lower = cleaned.toLowerCase();
  if (/^hi\b|^hey\b/.test(lower)) return cleaned;

  const leadByFocus = {
    relationships: ["That sounds meaningful.", "I can feel this matters to you."],
    workload: ["That sounds draining.", "That is a lot to carry."],
    emotional_safety: ["I hear you.", "I am really glad you shared that."],
    positive_state: ["I love hearing that.", "That is beautiful to hear."],
    user_selected: ["Of course.", "No pressure."],
    general_reflection: ["I hear you.", "Thanks for sharing that."],
  };
  const leads = leadByFocus[focus] || leadByFocus.general_reflection;
  const lead = leads[Math.floor(Math.random() * leads.length)];

  if (/^what\b|^which\b|^when\b|^how\b/.test(lower)) {
    return `${lead} ${cleaned}`;
  }
  return `${lead} ${cleaned}`;
}

function enrichPayload(payload, candidates) {
  const enriched = {
    ...payload,
    evidence: normalizeEvidence(payload.evidence, candidates),
    insight: payload.insight || "",
    question: payload.question || "",
    reasoning: payload.reasoning || "",
    confidence: Number(payload.confidence || 0),
    currentFocus: payload.currentFocus || "general_reflection",
  };

  if (!enriched.fallback && enriched.evidence.length === 0 && candidates.length > 0) {
    enriched.evidence = [candidates[0]];
    enriched.reasoning = `${enriched.reasoning} Added nearest evidence candidate from recent memory.`.trim();
  }

  if (!enriched.question) {
    enriched.question = "When this pattern appears, what thought usually shows up first for you?";
  }

  if (!enriched.fallback && enriched.confidence < policyConfig.minConfidence && enriched.evidence.length > 0) {
    enriched.confidence = Math.max(policyConfig.minConfidence, 0.68);
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
  if (uncertainRegex.test(text)) return "uncertain";
  if (affirmativeRegex.test(text)) return "affirmative";
  if (positiveOutcomeRegex.test(text)) return "positive_checkin";
  if (positiveRegex.test(text)) return "positive_checkin";
  return "reflection";
}

function inferFocus(userMessage, themes = [], blocked = []) {
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

  const defaultFocuses = ["growth", "relationships", "motivation", "calm", "creativity"];
  return defaultFocuses.find((f) => !blocked.includes(f)) || "growth";
}

function buildHeuristicPayload({ userMessage, candidates, themes, healthQuality, forceNewFocus, recentFocuses }) {
  if (!candidates.length) return null;
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
  const supportiveOpeners = [
    "I hear you.",
    "Thanks for sharing that.",
    "I am with you on this.",
  ];
  const opener = supportiveOpeners[Math.floor(Math.random() * supportiveOpeners.length)];
  const friendlyInsight = isProblemSignal
    ? `${opener} There may be a pattern around ${patternPhrase}.${healthHint}`
    : `${opener} We can keep this simple and talk through what matters most today.`;
  return {
    schemaVersion: "1.0",
    insight: friendlyInsight,
    question:
      questionByFocus[focus] ||
      "What feels most important to explore right now so this conversation is useful for you?",
    evidence: [top, second].slice(0, 2),
    confidence: 0.67,
    reasoning: `Heuristic reflective synthesis generated from recurring themes and recent journal evidence for: "${userMessage}".`,
    fallback: false,
    currentFocus: focus,
  };
}

export function buildIntentPayload({ intent, candidates }) {
  const evidence = candidates.length ? [candidates[0]] : [];
  if (intent === "greeting") {
    return {
      schemaVersion: "1.0",
      insight: "Good to see you here.",
      question: "Hey, I am glad you are here. How are you feeling right now?",
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
      insight: "I hear a positive shift in your mood.",
      question: "Love that. What do you think made today feel better for you?",
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
      insight: "Got it, we can focus on relationships.",
      question: "Of course. Tell me a little about what is happening in your relationships right now.",
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
      insight: evidence.length ? "I hear appreciation and openness in what you shared." : "",
      question: "That is lovely. What part of this moment do you want to carry into tomorrow?",
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
        "I mean the moments, habits, or people that made you feel better today. Which one stands out most?",
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
      question: "No pressure at all. We can start small - mood, relationships, work, or energy?",
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
      question: "Great, let us keep it simple. Which one should we start with: mood, relationships, work, or energy?",
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
      insight: "It sounds like things feel heavy right now.",
      question: "I am sorry it feels heavy. What feels strongest right now - thoughts, body tension, or the situation itself?",
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
      question: "Sure. I am here with you. What do you feel like talking about now?",
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
  const recentQuestions = recentTurns
    .slice(-5)
    .map((t) => String(t.aiResponse || "").toLowerCase().trim())
    .filter(Boolean);
  const current = String(payload.question || "").toLowerCase().trim();
  if (!current || !recentQuestions.includes(current)) return payload;

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
  };
  const generic = [
    "What feels most important for us to unpack right now?",
    "If you had to name the main feeling in one word, what would it be?",
    "What happened right before this feeling became stronger?",
    "What would make this conversation most useful for you today?",
  ];
  const alternatives = [...(byFocus[payload.currentFocus] || []), ...generic];
  const nextQuestion = alternatives.find((q) => !recentQuestions.includes(q.toLowerCase())) || alternatives[0];
  return {
    ...payload,
    question: humanizeQuestion(nextQuestion, payload.currentFocus),
    reasoning: `${payload.reasoning} Repetition guard replaced repeated prompt.`.trim(),
  };
}

export function buildContextFollowUp({ userMessage, sessionTurns = [] }) {
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
      insight: "That is meaningful and kind.",
      question: "How did helping them make you feel afterward?",
      evidence: [],
      confidence: 0.66,
      reasoning: "Positive-thread follow-up after gratitude response.",
      fallback: false,
      currentFocus: "positive_state",
    };
  }

  if (
    /because|passed|did well|went well|exam|cleared|won|success|succeeded/.test(text) &&
    /made today feel better|positive shift|what do you think made today feel better/.test(lastAi)
  ) {
    return {
      schemaVersion: "1.0",
      insight: "That is a big win, and you earned it.",
      question: "What do you think helped you perform well this time that you can reuse next time too?",
      evidence: [],
      confidence: 0.68,
      reasoning: "Positive continuation follow-up to keep context on achievement thread.",
      fallback: false,
      currentFocus: "positive_state",
    };
  }

  return null;
}

function scrubHealthReferences(payload) {
  const scrub = (text) =>
    String(text || "")
      .replace(/\b(sleep|stress|heart rate|heart|steps|activity|recovery)\b/gi, "energy pattern")
      .replace(/\s+/g, " ")
      .trim();

  return {
    ...payload,
    insight: scrub(payload.insight),
    question: scrub(payload.question),
    reasoning: scrub(payload.reasoning),
  };
}

async function generateInsightWithOllama(prompt) {
  const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      format: "json",
      options: {
        temperature: 0.2,
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
  });

  if (!response.ok) {
    throw new AppError("AI_PARSE_FAILED", `Ollama request failed with status ${response.status}`, 502);
  }

  const data = await response.json();
  const text = String(data?.message?.content || "").replace(/```json|```/g, "").trim();
  const parsed = parseJsonSafe(text);
  if (validateAiPayload(parsed)) return parsed;
  const coerced = coerceAiPayload(parsed);
  if (!coerced) {
    throw new AppError("AI_PARSE_FAILED", "Ollama response could not be normalized", 502);
  }
  return coerced;
}

async function generateInsight(context, userMessage) {
  if (!geminiClient && !openaiClient && !useOllama) {
    throw new AppError("AI_PARSE_FAILED", "AI key missing; AI generation unavailable", 502);
  }
  const prompt = `
You are ReflectAI, a reflective non-medical coach.
Return ONLY valid JSON with this exact shape:
{
  "schemaVersion":"1.0",
  "insight":"string",
  "question":"string",
  "evidence":[{"journalId":"string","quote":"string","date":"ISO date"}],
  "confidence":0.0,
  "reasoning":"string",
  "fallback":false,
  "currentFocus":"string"
}
Rules:
- Never diagnose, never give medical advice, never prescribe solutions.
- Ask open-ended Socratic question.
- Use at least one evidence object from evidenceCandidates when fallback=false.
- If evidence is weak, set fallback=true and keep insight empty.
- If user requests topic shift, do not repeat prior focus.
- Sound human, warm, and natural (like a supportive friend), not robotic or clinical.
- Keep wording simple and conversational. Avoid corporate phrases and avoid repeating the same sentence patterns.
- Start from empathy first, then one clear reflective question.
- Never ask more than one main question per turn.
- Keep language concise but human. Prefer 2-4 short sentences total.
- If user says only a short opener like "hi", respond with a friendly check-in question.
- If user says "chat", "lets talk", or "open chat", do NOT force a theme; invite free conversation.
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
- Mode output guardrails (MUST):
  - quick: one warm short reflection + one simple follow-up question.
  - deep: include emotional validation + one thought-provoking deeper question.
  - analysis: mention one observed pattern/trend, then ask one probing question.
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
  let geminiRateLimited = false;
  const aiTemperature = 0.55;

  const parseModelOutput = (text) => {
    const parsed = parseJsonSafe(text);
    if (validateAiPayload(parsed)) return parsed;
    const coerced = coerceAiPayload(parsed);
    if (coerced) return coerced;
    return textToPayload(text, context);
  };

  const runProvider = async (provider) => {
    const model = provider === "gemini" ? geminiModel : openaiModel;
    const client = provider === "gemini" ? geminiClient : openaiClient;
    if (!client) return null;
    const mode = context.settings?.mode || "quick";
    const style = Number(context.settings?.responseStyle ?? 50);
    const tunedTemp =
      mode === "analysis" ? 0.48 : mode === "deep" ? 0.64 : style < 40 ? 0.6 : aiTemperature;
    const result = await client.chat.completions.create({
      model,
      temperature: tunedTemp,
      messages: [{ role: "user", content: prompt }],
    });
    const text = String(result.choices?.[0]?.message?.content || "").replace(/```json|```/g, "").trim();
    const payload = parseModelOutput(text);
    if (!payload) {
      throw new AppError("AI_PARSE_FAILED", `${provider} response could not be parsed`, 502);
    }
    return payload;
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (useOllama) {
      try {
        const payload = await generateInsightWithOllama(prompt);
        return { payload, source: "ollama" };
      } catch {
        // Fall through to cloud LLM if configured.
      }
    }

    try {
      // Gemini first (cost-saving), then OpenAI fallback only if needed.
      if (geminiClient) {
        try {
          const payload = await runProvider("gemini");
          if (payload) return { payload, source: "gemini" };
        } catch (error) {
          lastError = error;
          if (error?.status === 429 || /429|rate limit/i.test(String(error?.message || ""))) {
            geminiRateLimited = true;
          }
        }
      }

      if (openaiClient && openaiFallbackMode === "auto") {
        const payload = await runProvider("openai");
        if (payload) {
          return {
            payload,
            source: "openai",
            notice: geminiRateLimited
              ? "Gemini limit reached. Switched to OpenAI backup. To reduce paid usage, pause or retry later."
              : "",
          };
        }
      }
    } catch (error) {
      lastError = error;
      continue;
    }
  }
  if (geminiRateLimited && !openaiClient) {
    throw new AppError(
      "AI_RATE_LIMITED",
      "Gemini limit reached. Stop chat execution for now and switch to OpenAI backup when needed.",
      429,
    );
  }
  if (geminiRateLimited && openaiFallbackMode !== "auto") {
    throw new AppError(
      "AI_RATE_LIMITED",
      "Gemini limit reached. Stopped here to avoid paid OpenAI usage. Enable OpenAI fallback only when you want to continue.",
      429,
    );
  }
  if (lastError?.status === 429 || /429/.test(String(lastError?.message || ""))) {
    throw new AppError("AI_RATE_LIMITED", "AI provider rate limit reached", 429);
  }
  throw new AppError("AI_PARSE_FAILED", "AI response could not be parsed", 502);
}

export function verifyInsight({ payload, healthQuality }) {
  const decisions = {
    evidencePresent: payload.fallback ? true : payload.evidence.length > 0,
    confidenceOk: payload.fallback ? true : payload.confidence >= policyConfig.minConfidence,
    healthClaimsEligible: true,
  };

  const usesHealth = /sleep|stress|heart|steps|activity|recovery/i.test(
    `${payload.insight} ${payload.question}`,
  );
  if (usesHealth && !healthQuality.eligible) decisions.healthClaimsEligible = false;

  const accepted = decisions.evidencePresent && decisions.confidenceOk && decisions.healthClaimsEligible;
  return { accepted, decisions };
}

export async function buildChatContext(userId) {
  const journals = await JournalEntry.find({ userId }).sort({ createdAt: -1 }).limit(20);
  const retrospect = await RetrospectAnalysis.findOne({ userId }).sort({ createdAt: -1 });
  const health = await HealthData.find({
    userId,
    date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  }).sort({ date: -1 });
  const session = await ChatSession.findOne({ userId });
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

export async function processChatTurn({ userId, userMessage, chatSettings = {} }) {
  const normalizedSettings = normalizeChatSettings(chatSettings);
  const context = await buildChatContext(userId);
  const recentTurns = context.session?.turns || [];
  const journalPool = normalizedSettings.useMemory ? context.journals : [];
  const intent = detectIntent(userMessage);
  const evidenceCandidates = buildEvidenceCandidates(journalPool, userMessage, intent);
  const blueprint = buildLongitudinalBlueprint({
    userMessage,
    journals: journalPool,
    themes: context.themes,
    sessionTurns: recentTurns,
    mode: normalizedSettings.mode,
  });
  const contextFollowUp = buildContextFollowUp({ userMessage, sessionTurns: recentTurns });
  const intentPayload = buildIntentPayload({ intent, candidates: evidenceCandidates });
  const recentFocuses = recentTurns.slice(-3).map((t) => String(t.focus || "").toLowerCase());
  const heuristicPayload = buildHeuristicPayload({
    userMessage,
    candidates: evidenceCandidates,
    themes: context.themes,
    healthQuality: context.healthQuality,
    forceNewFocus: intent === "topic_switch",
    recentFocuses,
  });
  let payload = null;
  let parseFailed = false;
  let responseSource = "fallback";
  const aiAvailable = !!geminiClient || !!openaiClient || useOllama;

  // Prefer deterministic conversational continuity for short follow-ups before model call.
  if (contextFollowUp) {
    payload = contextFollowUp;
    responseSource = "continuity";
  } else if (intentPayload && intent !== "reflection") {
    payload = intentPayload;
    responseSource = "intent";
  }

  if (!payload && aiAvailable) {
    try {
      const generated = await generateInsight(
        {
          journals: context.journals.map((j) => ({
            id: String(j._id),
            content: j.content,
            mood: j.mood,
            date: j.createdAt,
          })),
          evidenceCandidates,
          themes: context.themes,
          latestRetrospect: context.retrospect?.summary || "",
          healthQuality: context.healthQuality,
          blueprint,
          settings: normalizedSettings,
          lastAssistantQuestion: String(recentTurns.slice(-1)[0]?.aiResponse || ""),
          normalizedUserMessage: normalizeText(userMessage),
          inferredIntent: intent,
        },
        userMessage,
      );
      payload = enrichPayload(generated.payload, evidenceCandidates);
      payload = avoidRepeatedQuestion(payload, recentTurns);
      responseSource = generated.source || "openai";
      if (generated.notice) {
        payload.providerAlert = generated.notice;
      }
    } catch (error) {
      parseFailed = true;
      payload = null;
      responseSource = "fallback";
      const rateLimited =
        error?.code === "AI_RATE_LIMITED" ||
        error?.statusCode === 429 ||
        /rate limit|429/i.test(String(error?.message || ""));
      if (rateLimited) {
        payload = heuristicPayload || fallbackPayload({
          question:
            "Gemini limit was reached, so I paused here to avoid paid OpenAI usage. Retry later or enable OpenAI fallback.",
          insight: "",
          evidence: [],
          currentFocus: "user_selected",
          reasoning: "Minimal non-rule fallback due to upstream rate limiting.",
        });
        if (payload && !payload.fallback) {
          payload.reasoning = `${payload.reasoning} Used heuristic reflective continuity because upstream model was rate-limited.`;
        }
        payload.providerAlert =
          "Gemini limit reached. Execution paused to reduce cost. OpenAI backup is currently manual-only.";
      }
    }
  }

  if (!payload) {
    payload =
      heuristicPayload ||
      fallbackPayload({
        question: "I am here with you. I had a brief connection issue. Could you send that once more?",
        insight: "",
        evidence: [],
        currentFocus: "user_selected",
        reasoning: "Minimal non-rule fallback after model generation failure.",
      });
    if (payload && !payload.fallback) {
      payload.reasoning = `${payload.reasoning} Used heuristic reflective continuity after model generation failure.`;
    }
    responseSource = "fallback";
  }

  if (!context.healthQuality.eligible && !payload.fallback) {
    payload = scrubHealthReferences(payload);
  }

  const verification = verifyInsight({ payload, healthQuality: context.healthQuality });
  const accepted = verification.accepted;
  const finalPayload = accepted ? payload : fallbackPayload();
  finalPayload.source = accepted ? responseSource : "fallback";
  finalPayload.chatSettings = normalizedSettings;
  const responseText = [String(finalPayload.insight || "").trim(), String(finalPayload.question || "").trim()]
    .filter(Boolean)
    .join("\n\n");

  const audit = await AuditLog.create({
    userId,
    triggerReason: "chat_turn",
    retrievedMemoryIds: context.journals.map((j) => j._id.toString()),
    detectedPatterns: context.themes,
    evidenceIds: (finalPayload.evidence || []).map((e) => String(e.journalId || "")),
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

  const session = await ChatSession.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: { userId },
      $push: {
        turns: {
          userMessage,
          aiResponse: responseText || finalPayload.question,
          evidence: finalPayload.evidence,
          confidence: finalPayload.confidence,
          fallback: finalPayload.fallback,
          reasoning: finalPayload.reasoning,
          focus: finalPayload.currentFocus || "general_reflection",
          createdAt: new Date(),
        },
      },
    },
    { upsert: true, new: true },
  );

  return {
    payload: finalPayload,
    readiness: context.readiness,
    themes: context.themes,
    healthQuality: context.healthQuality,
    session,
  };
}

