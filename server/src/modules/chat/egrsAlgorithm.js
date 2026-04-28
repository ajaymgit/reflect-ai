const ALGORITHM_VERSION = "EGRS-1.0.0";

const STOP_WORDS = new Set([
  "the",
  "and",
  "that",
  "this",
  "with",
  "from",
  "have",
  "just",
  "feel",
  "felt",
  "about",
  "what",
  "when",
  "where",
  "which",
  "your",
  "you",
  "are",
  "was",
  "were",
  "for",
  "into",
  "today",
  "really",
  "very",
]);

const MOOD_INTENSITY = {
  happy: 0.45,
  calm: 0.35,
  reflective: 0.3,
  sad: 0.7,
  stressed: 0.78,
  angry: 0.82,
};

const FOCUS_TOKEN_MAP = [
  { focus: "workload", tokens: ["work", "meeting", "deadline", "task", "office", "pressure"] },
  { focus: "relationships", tokens: ["friend", "partner", "family", "relationship", "lonely", "miss"] },
  { focus: "energy", tokens: ["tired", "sleep", "exhausted", "drained", "fatigue", "energy"] },
  { focus: "motivation", tokens: ["motivation", "stuck", "goal", "discipline", "avoid"] },
  { focus: "self_worth", tokens: ["confidence", "worth", "compare", "failure", "proud"] },
  { focus: "calm", tokens: ["calm", "grounded", "breathing", "peace", "quiet"] },
];

const HEALTH_REGEX = /\b(sleep|slept|stress|stressed|heart|steps|walking|walk|activity|movement|recovery|tired|fatigue|screen time|calories)\b/i;
const PATTERN_REGEX = /\b(pattern|why|always|again|usually|linked|connect|correlation|because|trigger|affect|impact)\b/i;
const CRISIS_REGEX =
  /\b(kill myself|suicide|suicidal|self harm|self-harm|hurt myself|end my life|want to die|no reason to live)\b/i;

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeText(text)
    .split(/\s+/)
    .map((word) => word.replace(/^_+|_+$/g, ""))
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function inferFocus(tokens, themes = []) {
  const themeTokens = tokenize(themes.join(" "));
  const allTokens = new Set([...tokens, ...themeTokens]);
  const matched = FOCUS_TOKEN_MAP.find((item) => item.tokens.some((token) => allTokens.has(token)));
  return matched?.focus || "general_reflection";
}

function scoreJournalEvidence({ journal, queryTokens, focus, now }) {
  const contentTokens = tokenize(`${journal.content || ""} ${(journal.themes || []).join(" ")}`);
  const contentSet = new Set(contentTokens);
  const overlap = queryTokens.filter((token) => contentSet.has(token));
  const overlapScore = queryTokens.length ? overlap.length / queryTokens.length : 0;
  const focusRule = FOCUS_TOKEN_MAP.find((item) => item.focus === focus);
  const focusScore = focusRule?.tokens.some((token) => contentSet.has(token)) ? 0.18 : 0;
  const themeScore = Array.isArray(journal.themes) && journal.themes.length ? 0.08 : 0;
  const moodIntensity = MOOD_INTENSITY[journal.mood] ?? 0.3;
  const ageDays = Math.max(0, (now - new Date(journal.createdAt).getTime()) / 86400000);
  const recencyScore = clamp(1 - ageDays / 21) * 0.22;
  const score = clamp(overlapScore * 0.42 + focusScore + themeScore + moodIntensity * 0.1 + recencyScore);

  return {
    journalId: String(journal._id),
    quote: String(journal.content || "").slice(0, 220),
    date: journal.createdAt,
    mood: journal.mood,
    themes: journal.themes || [],
    score: Number(score.toFixed(3)),
    matchedSignals: overlap.slice(0, 8),
  };
}

function calculateEvidenceConfidence({ rankedEvidence, queryTokens, themes, healthQuality, healthTopic }) {
  const topScore = rankedEvidence[0]?.score || 0;
  const supportCount = rankedEvidence.filter((item) => item.score >= 0.22).length;
  const querySpecificity = clamp(queryTokens.length / 12);
  const themeSupport = themes.length ? 0.06 : 0;
  const healthSupport = healthTopic && healthQuality?.eligible ? 0.08 : 0;
  const sparsePenalty = supportCount === 0 ? 0.18 : supportCount === 1 ? 0.06 : 0;

  return clamp(
    0.42 + topScore * 0.32 + Math.min(supportCount, 3) * 0.055 + querySpecificity * 0.07 + themeSupport + healthSupport - sparsePenalty,
    0,
    0.92,
  );
}

function buildFallbackQuestion({ crisisDetected, healthTopic, patternRequest, focus }) {
  if (crisisDetected) {
    return "I am really sorry you are feeling this. Are you safe right now, and can you contact someone you trust immediately?";
  }
  if (healthTopic && patternRequest) {
    return "I do not have enough reliable evidence to connect health and mood yet. When do you notice this most?";
  }
  const byFocus = {
    workload: "I do not want to assume from weak evidence. Which work moment affected you most today?",
    relationships: "I do not have enough context yet. Which relationship moment feels most important right now?",
    energy: "I do not have enough proof for a pattern yet. When does your energy usually drop?",
    motivation: "I need a little more context first. What feels hardest to start right now?",
    self_worth: "I do not want to guess. What moment recently made you question yourself?",
    calm: "I need more context. What helps you feel even slightly calmer?",
  };
  return byFocus[focus] || "I do not want to assume from limited evidence. What feels most important right now?";
}

export function buildEvidenceGate({
  userMessage,
  journals = [],
  healthQuality = {},
  themes = [],
  settings = {},
} = {}) {
  const normalizedMessage = normalizeText(userMessage);
  const queryTokens = tokenize(normalizedMessage);
  const healthTopic = HEALTH_REGEX.test(userMessage);
  const patternRequest = PATTERN_REGEX.test(userMessage);
  const crisisDetected = CRISIS_REGEX.test(userMessage);
  const focus = inferFocus(queryTokens, themes);
  const now = Date.now();
  const rankedEvidence = journals
    .map((journal) => scoreJournalEvidence({ journal, queryTokens, focus, now }))
    .sort((a, b) => b.score - a.score);
  const selectedEvidence = rankedEvidence.filter((item) => item.score >= 0.18).slice(0, 3);
  const confidenceCeiling = calculateEvidenceConfidence({
    rankedEvidence,
    queryTokens,
    themes,
    healthQuality,
    healthTopic,
  });
  const minimumEvidenceScore = patternRequest || healthTopic ? 0.24 : 0.18;
  const evidenceScoreOk = (rankedEvidence[0]?.score || 0) >= minimumEvidenceScore;
  const enoughEvidence = selectedEvidence.length > 0 && evidenceScoreOk;
  const healthClaimAllowed = !healthTopic || Boolean(healthQuality?.eligible);
  const memoryDisabled = settings.useMemory === false;
  const requiresFallback = crisisDetected || memoryDisabled || !enoughEvidence || !healthClaimAllowed;
  const blockedReasons = [
    crisisDetected ? "crisis_signal_detected" : null,
    memoryDisabled ? "memory_disabled_by_user" : null,
    !enoughEvidence ? "insufficient_personal_evidence" : null,
    !healthClaimAllowed ? "health_data_not_eligible" : null,
  ].filter(Boolean);

  return {
    algorithm: "Evidence-Gated Reflective Safety",
    version: ALGORITHM_VERSION,
    focus,
    normalizedMessage,
    querySignals: queryTokens.slice(0, 12),
    healthTopic,
    patternRequest,
    crisisDetected,
    selectedEvidence,
    rankedEvidence: rankedEvidence.slice(0, 5),
    evidenceScore: Number((rankedEvidence[0]?.score || 0).toFixed(3)),
    evidenceScoreOk,
    confidenceCeiling: Number(confidenceCeiling.toFixed(3)),
    healthClaimAllowed,
    requiresFallback,
    blockedReasons,
    fallbackQuestion: buildFallbackQuestion({ crisisDetected, healthTopic, patternRequest, focus }),
  };
}

export function applyEvidenceGate(payload, gate) {
  const base = {
    ...payload,
    confidence: Number(payload?.confidence || 0),
    evidence: Array.isArray(payload?.evidence) ? payload.evidence : [],
  };

  if (gate.crisisDetected) {
    return {
      schemaVersion: "1.0",
      insight: "Your safety matters more than analysis right now.",
      question: gate.fallbackQuestion,
      evidence: [],
      confidence: 0,
      reasoning: "EGRS crisis safety gate blocked reflective analysis and returned immediate support prompt.",
      fallback: true,
      currentFocus: "emotional_safety",
      egrs: gate,
    };
  }

  if (gate.requiresFallback && !base.fallback) {
    return {
      schemaVersion: "1.0",
      insight: "",
      question: gate.fallbackQuestion,
      evidence: [],
      confidence: 0,
      reasoning: `EGRS blocked unsupported response: ${gate.blockedReasons.join(", ")}.`,
      fallback: true,
      currentFocus: gate.focus,
      egrs: gate,
    };
  }

  const gatedConfidence = base.fallback
    ? base.confidence
    : Math.min(Math.max(base.confidence, 0.62), gate.confidenceCeiling);

  return {
    ...base,
    confidence: Number(gatedConfidence.toFixed(3)),
    reasoning: `${base.reasoning || ""} EGRS confidence ceiling=${gate.confidenceCeiling}, evidenceScore=${gate.evidenceScore}.`.trim(),
    currentFocus: base.currentFocus || gate.focus,
    egrs: gate,
  };
}

export function verifyEvidenceGate({ payload, gate, minConfidence }) {
  const fallbackOk = Boolean(payload?.fallback);
  const evidenceIds = new Set(gate.selectedEvidence.map((item) => item.journalId));
  const payloadEvidence = Array.isArray(payload?.evidence) ? payload.evidence : [];
  const usesSelectedEvidence = payloadEvidence.some((item) => evidenceIds.has(String(item.journalId || "")));
  const evidenceGateOk = fallbackOk || (gate.evidenceScoreOk && usesSelectedEvidence);
  const confidenceGateOk = fallbackOk || Number(payload?.confidence || 0) >= minConfidence;
  const healthGateOk = fallbackOk || gate.healthClaimAllowed;
  const crisisGateOk = !gate.crisisDetected || fallbackOk;

  return {
    evidenceGateOk,
    confidenceGateOk,
    healthGateOk,
    crisisGateOk,
    acceptedByEvidenceGate: evidenceGateOk && confidenceGateOk && healthGateOk && crisisGateOk,
  };
}
