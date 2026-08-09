import OpenAI from "openai";
import AuditLog from "../../models/AuditLog.js";
import ChatSession from "../../models/ChatSession.js";
import HealthData from "../../models/HealthData.js";
import JournalEntry from "../../models/JournalEntry.js";
import RetrospectAnalysis from "../../models/RetrospectAnalysis.js";
import { env, policyConfig } from "../../shared/config/env.js";
import { AppError } from "../../shared/utils/AppError.js";

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

const usingGeminiCompat = !env.OPENAI_API_KEY && !!env.GEMINI_API_KEY;
const aiApiKey = env.OPENAI_API_KEY || env.GEMINI_API_KEY;
const aiModel = env.AI_MODEL || (usingGeminiCompat ? "gemini-2.0-flash" : "gpt-4.1-mini");
const aiTemperature = usingGeminiCompat ? 0.7 : 0.45;
const useOllama = String(env.USE_OLLAMA || "true").toLowerCase() !== "false";
const ollamaBaseUrl = env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const ollamaModel = env.OLLAMA_MODEL || "llama3.2:3b";
const openai = aiApiKey
  ? new OpenAI({
      apiKey: aiApiKey,
      timeout: 12000,
      maxRetries: 1,
      ...(usingGeminiCompat ? { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" } : {}),
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

function normalizeEvidence(evidence, candidates) {
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
      return null;
    })
    .filter(Boolean);
  return result;
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

function normalizeChatSettings(raw = {}) {
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
    // Previously unlisted, so every one of these focuses fell through to the
    // same general_reflection pair ("I hear you." / "Thanks for sharing
    // that.") -- fine on its own, but combined with the old "growth every
    // time" default-focus bug, it meant a long run of unrelated messages
    // could sound almost identical turn after turn.
    growth: ["That makes sense.", "Good, let's dig into that."],
    motivation: ["I get that.", "That's a real thing to sit with."],
    self_worth: ["That's worth pausing on.", "I hear that."],
    calm: ["Makes sense.", "Good to know."],
    creativity: ["I like that.", "That's worth exploring."],
    energy: ["That tracks.", "I hear you."],
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

  // Deliberately no evidence auto-fill here. Previously, whenever the model
  // returned an empty evidence array, this function substituted the user's
  // most recent journal entry as "evidence" regardless of whether it had
  // anything to do with the model's claim -- which meant the evidence-required
  // safety check below could never actually catch an unsupported claim for
  // any user who had written at least one journal entry. If the model made a
  // claim with no evidence, the honest outcome is a fallback, not a claim
  // dressed up with an unrelated citation.

  if (!enriched.question) {
    enriched.question = "When this pattern appears, what thought usually shows up first for you?";
  }

  // Deliberately no confidence floor-boost here either. Previously, any
  // evidence at all (including the auto-filled evidence removed above) would
  // silently raise a low-confidence model response to at least 0.68 before
  // the confidenceOk check ran, which misrepresented the model's own
  // uncertainty to the user. A genuinely low-confidence response should now
  // correctly fail verifyInsight's confidenceOk check and fall back.

  enriched.question = humanizeQuestion(enriched.question, enriched.currentFocus);

  return enriched;
}

function detectTopicShift(userMessage) {
  const text = normalizeText(userMessage);
  return topicSwitchRegex.test(text);
}

function detectIntent(userMessage) {
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
  const supportiveOpeners = [
    "I hear you.",
    "Thanks for sharing that.",
    "I am with you on this.",
  ];
  const opener = supportiveOpeners[Math.floor(Math.random() * supportiveOpeners.length)];
  const friendlyInsight = isProblemSignal && hasEvidence
    ? `${opener} There may be a pattern around ${patternPhrase}.${healthHint}`
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
      insight: "That is meaningful and kind.",
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

function scrubHealthReferences(payload) {
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
  if (!openai && !useOllama) {
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
- Keep question under 24 words.
- Keep insight under 28 words.
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
    if (useOllama) {
      try {
        return await generateInsightWithOllama(prompt);
      } catch {
        // Fall through to cloud LLM if configured.
      }
    }

    if (!openai) continue;

    try {
      let text = "";
      if (usingGeminiCompat) {
        const mode = context.settings?.mode || "quick";
        const style = Number(context.settings?.responseStyle ?? 50);
        const tunedTemp =
          mode === "analysis" ? 0.45 : mode === "deep" ? 0.62 : style < 40 ? 0.58 : 0.5;
        const result = await openai.chat.completions.create({
          model: aiModel,
          temperature: tunedTemp ?? aiTemperature,
          messages: [{ role: "user", content: prompt }],
        });
        text = String(result.choices?.[0]?.message?.content || "").replace(/```json|```/g, "").trim();
      } else {
        const result = await openai.responses.create({
          model: aiModel,
          input: prompt,
          temperature: aiTemperature,
        });
        text = String(result.output_text || "").replace(/```json|```/g, "").trim();
      }
      const parsed = parseJsonSafe(text);
      if (validateAiPayload(parsed)) return parsed;
      const coerced = coerceAiPayload(parsed);
      if (coerced) return coerced;
      const textPayload = textToPayload(text, context);
      if (textPayload) return textPayload;
    } catch (error) {
      lastError = error;
      // Try the next attempt before failing hard.
      continue;
    }
  }
  if (lastError?.status === 429 || /429/.test(String(lastError?.message || ""))) {
    throw new AppError("AI_RATE_LIMITED", "AI provider rate limit reached", 429);
  }
  throw new AppError("AI_PARSE_FAILED", "AI response could not be parsed", 502);
}

function verifyInsight({ payload, rawText, healthQuality }) {
  const decisions = {
    evidencePresent: payload.fallback ? true : payload.evidence.length > 0,
    confidenceOk: payload.fallback ? true : payload.confidence >= policyConfig.minConfidence,
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

// Rule-based responder used both when no AI provider is configured at all,
// and as a graceful degrade when a configured provider's call fails for any
// non-rate-limit reason. Was already fully written (detectIntent /
// buildContextFollowUp / buildIntentPayload / buildHeuristicPayload /
// avoidRepeatedQuestion) but only ever wired into the "no provider" branch --
// giving real, varied, on-brand responses in both cases instead of the one
// hardcoded apology line every AI-call failure used to fall back to.
function buildHeuristicResponse({ userMessage, context, evidenceCandidates }) {
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

export async function processChatTurn({ userId, userMessage, chatSettings = {} }) {
  const normalizedSettings = normalizeChatSettings(chatSettings);
  const context = await buildChatContext(userId);
  const journalPool = normalizedSettings.useMemory ? context.journals : [];
  const evidenceCandidates = buildEvidenceCandidates(journalPool, userMessage, "reflection");
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
  const aiAvailable = !!openai || useOllama;

  if (aiAvailable) {
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
          lastAssistantQuestion: String((context.session?.turns || []).slice(-1)[0]?.aiResponse || ""),
          normalizedUserMessage: normalizeText(userMessage),
        },
        userMessage,
      );
      payload = enrichPayload(generated, evidenceCandidates);
      responseSource = usingGeminiCompat ? "gemini" : "openai";
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
            "I am still here with you. The AI is briefly overloaded right now - can we try again in about a minute?",
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
      question: "I am here with you. I had a brief connection issue. Could you send that once more?",
      insight: "",
      evidence: [],
      currentFocus: "user_selected",
      reasoning: "Minimal non-rule fallback after model generation failure.",
    });
    responseSource = "fallback";
  }

  if (responseSource !== "fallback" && useOllama) {
    responseSource = "ollama";
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

  const verification = verifyInsight({ payload, rawText, healthQuality: context.healthQuality });
  const accepted = verification.accepted;
  const finalPayload = accepted ? payload : fallbackPayload();
  finalPayload.source = accepted ? responseSource : "fallback";
  finalPayload.chatSettings = normalizedSettings;

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
    aiResponse: finalPayload.question,
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
  };
}

