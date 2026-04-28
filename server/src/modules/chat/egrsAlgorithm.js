const ALGORITHM_VERSION = "EGRS-2.0.0";

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
const CAUSATION_REGEX = /\b(cause|caused|causing|because of|leads to|makes me|main reason|root cause)\b/i;
const ADVICE_REGEX = /\b(should|must|need to|have to|do this|stop doing|start doing|fix|solution|recommend)\b/i;

const CLAIM_PERMISSION_MATRIX = {
  crisis_response: {
    minEvidenceCount: 0,
    minEvidenceScore: 0,
    minConfidence: 0,
    requiresHealth: false,
    blocksAdvice: false,
    allowFallbackOnly: true,
  },
  current_reflection: {
    minEvidenceCount: 0,
    minEvidenceScore: 0,
    minConfidence: 0.45,
    requiresHealth: false,
    blocksAdvice: true,
    allowFallbackOnly: false,
  },
  journal_insight: {
    minEvidenceCount: 1,
    minEvidenceScore: 0.18,
    minConfidence: 0.62,
    requiresHealth: false,
    blocksAdvice: true,
    allowFallbackOnly: false,
  },
  repeated_pattern: {
    minEvidenceCount: 2,
    minEvidenceScore: 0.24,
    minConfidence: 0.68,
    requiresHealth: false,
    blocksAdvice: true,
    allowFallbackOnly: false,
  },
  health_correlation: {
    minEvidenceCount: 2,
    minEvidenceScore: 0.28,
    minConfidence: 0.72,
    requiresHealth: true,
    blocksAdvice: true,
    allowFallbackOnly: false,
  },
  causation_claim: {
    minEvidenceCount: 3,
    minEvidenceScore: 0.32,
    minConfidence: 0.78,
    requiresHealth: false,
    blocksAdvice: true,
    allowFallbackOnly: false,
  },
  directive_advice: {
    minEvidenceCount: 0,
    minEvidenceScore: 0,
    minConfidence: 1,
    requiresHealth: false,
    blocksAdvice: true,
    allowFallbackOnly: true,
  },
};

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

function classifyClaimType(text = "") {
  if (CRISIS_REGEX.test(text)) return "crisis_response";
  if (ADVICE_REGEX.test(text)) return "directive_advice";
  if (HEALTH_REGEX.test(text) && (PATTERN_REGEX.test(text) || CAUSATION_REGEX.test(text))) {
    return "health_correlation";
  }
  if (CAUSATION_REGEX.test(text)) return "causation_claim";
  if (PATTERN_REGEX.test(text)) return "repeated_pattern";
  if (String(text || "").trim().split(/\s+/).length <= 6) return "current_reflection";
  return "journal_insight";
}

function combineClaimTypes(...types) {
  const priority = [
    "crisis_response",
    "directive_advice",
    "health_correlation",
    "causation_claim",
    "repeated_pattern",
    "journal_insight",
    "current_reflection",
  ];
  return priority.find((type) => types.includes(type)) || "journal_insight";
}

function buildEvidenceGraph(journals = []) {
  const nodes = new Map();
  const edges = new Map();
  const moodCounts = {};

  for (const journal of journals) {
    const journalId = String(journal._id);
    const tokens = Array.from(new Set(tokenize(`${journal.content || ""} ${(journal.themes || []).join(" ")}`))).slice(0, 18);
    moodCounts[journal.mood] = (moodCounts[journal.mood] || 0) + 1;

    for (const token of tokens) {
      const existing = nodes.get(token) || {
        signal: token,
        count: 0,
        journalIds: new Set(),
        moods: {},
      };
      existing.count += 1;
      existing.journalIds.add(journalId);
      existing.moods[journal.mood] = (existing.moods[journal.mood] || 0) + 1;
      nodes.set(token, existing);
    }

    for (let i = 0; i < tokens.length; i += 1) {
      for (let j = i + 1; j < Math.min(tokens.length, i + 7); j += 1) {
        const key = [tokens[i], tokens[j]].sort().join("::");
        const existing = edges.get(key) || {
          signals: [tokens[i], tokens[j]].sort(),
          weight: 0,
          journalIds: new Set(),
          moods: {},
        };
        existing.weight += 1;
        existing.journalIds.add(journalId);
        existing.moods[journal.mood] = (existing.moods[journal.mood] || 0) + 1;
        edges.set(key, existing);
      }
    }
  }

  const serializeNode = (node) => ({
    signal: node.signal,
    count: node.count,
    journalIds: Array.from(node.journalIds).slice(0, 8),
    moods: node.moods,
  });
  const serializeEdge = (edge) => ({
    signals: edge.signals,
    weight: edge.weight,
    journalIds: Array.from(edge.journalIds).slice(0, 8),
    moods: edge.moods,
  });

  return {
    nodeCount: nodes.size,
    edgeCount: edges.size,
    moodCounts,
    strongestNodes: Array.from(nodes.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
      .map(serializeNode),
    strongestEdges: Array.from(edges.values())
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 12)
      .map(serializeEdge),
  };
}

function derivePatternLedger(evidenceGraph, queryTokens = []) {
  const querySet = new Set(queryTokens);
  const patterns = evidenceGraph.strongestEdges
    .filter((edge) => edge.signals.some((signal) => querySet.has(signal)) || edge.weight >= 2)
    .slice(0, 6)
    .map((edge) => ({
      patternId: edge.signals.join("_"),
      signals: edge.signals,
      evidenceCount: edge.journalIds.length,
      recurrence: edge.weight,
      confidence: Number(clamp(0.42 + edge.weight * 0.08 + Math.min(edge.journalIds.length, 5) * 0.04, 0, 0.88).toFixed(3)),
      supportingJournalIds: edge.journalIds,
    }));

  return patterns;
}

function detectContradiction({ text = "", claimType, evidenceGraph, queryTokens = [] }) {
  const responseTokens = tokenize(text);
  const graphSignals = new Set(evidenceGraph.strongestNodes.map((node) => node.signal));
  const graphEdges = evidenceGraph.strongestEdges.map((edge) => edge.signals);
  const unsupportedResponseSignals = responseTokens
    .filter((token) => !graphSignals.has(token) && !queryTokens.includes(token))
    .filter((token) => FOCUS_TOKEN_MAP.some((item) => item.tokens.includes(token)))
    .slice(0, 8);
  const hasGraphSupport = responseTokens.some((token) => graphSignals.has(token));
  const hasEdgeSupport = graphEdges.some((signals) => signals.every((signal) => responseTokens.includes(signal) || queryTokens.includes(signal)));
  const strictClaim = ["health_correlation", "causation_claim", "repeated_pattern"].includes(claimType);
  const contradictionDetected = strictClaim && unsupportedResponseSignals.length > 0 && !hasEdgeSupport;

  return {
    contradictionDetected,
    unsupportedResponseSignals,
    hasGraphSupport,
    hasEdgeSupport,
  };
}

function adaptPermission({ permission, journals, evidenceGraph, patternLedger, healthQuality }) {
  const dataRichnessBoost = journals.length >= 14 ? -0.03 : journals.length >= 7 ? -0.015 : 0.02;
  const graphBoost = evidenceGraph.edgeCount >= 20 ? -0.015 : 0;
  const recurringPatternBoost = patternLedger.some((pattern) => pattern.recurrence >= 3) ? -0.02 : 0;
  const healthPenalty = permission.requiresHealth && !healthQuality?.eligible ? 0.08 : 0;

  return {
    ...permission,
    minEvidenceScore: Number(clamp(permission.minEvidenceScore + dataRichnessBoost + graphBoost + recurringPatternBoost + healthPenalty, 0, 0.5).toFixed(3)),
    minConfidence: Number(clamp(permission.minConfidence + healthPenalty, 0, 1).toFixed(3)),
  };
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
  supportedHypotheses = [],
  contradictedHypotheses = [],
  settings = {},
} = {}) {
  const normalizedMessage = normalizeText(userMessage);
  const queryTokens = tokenize(normalizedMessage);
  const requestedClaimType = classifyClaimType(userMessage);
  const healthTopic = HEALTH_REGEX.test(userMessage);
  const patternRequest = PATTERN_REGEX.test(userMessage);
  const crisisDetected = CRISIS_REGEX.test(userMessage);
  const focus = inferFocus(queryTokens, themes);
  const now = Date.now();
  const evidenceGraph = buildEvidenceGraph(journals);
  const patternLedger = derivePatternLedger(evidenceGraph, queryTokens);
  const basePermission = CLAIM_PERMISSION_MATRIX[requestedClaimType] || CLAIM_PERMISSION_MATRIX.journal_insight;
  const permission = adaptPermission({
    permission: basePermission,
    journals,
    evidenceGraph,
    patternLedger,
    healthQuality,
  });
  const rankedEvidence = journals
    .map((journal) => scoreJournalEvidence({ journal, queryTokens, focus, now }))
    .sort((a, b) => b.score - a.score);
  const selectedEvidence = rankedEvidence.filter((item) => item.score >= Math.min(0.18, permission.minEvidenceScore)).slice(0, 3);
  const confidenceCeiling = calculateEvidenceConfidence({
    rankedEvidence,
    queryTokens,
    themes,
    healthQuality,
    healthTopic,
  });
  const minimumEvidenceScore = permission.minEvidenceScore;
  const evidenceScoreOk = (rankedEvidence[0]?.score || 0) >= minimumEvidenceScore;
  const enoughEvidence =
    selectedEvidence.length >= permission.minEvidenceCount &&
    (permission.minEvidenceCount === 0 || evidenceScoreOk);
  const healthClaimAllowed = !permission.requiresHealth || Boolean(healthQuality?.eligible);
  const hypothesisSignals = new Set(
    supportedHypotheses.flatMap((hypothesis) => {
      const sourceSignals = Array.isArray(hypothesis.sourceSignals) ? hypothesis.sourceSignals : [];
      return [...sourceSignals, hypothesis.signal].filter(Boolean);
    }),
  );
  const hypothesisClaimAllowed =
    !["repeated_pattern", "health_correlation", "causation_claim"].includes(requestedClaimType) ||
    queryTokens.some((token) => hypothesisSignals.has(token)) ||
    supportedHypotheses.some((hypothesis) => String(hypothesis.hypothesisText || "").toLowerCase().includes(focus));
  const contradictedHypothesis = contradictedHypotheses.find((hypothesis) => {
    const sourceSignals = Array.isArray(hypothesis.sourceSignals) ? hypothesis.sourceSignals : [];
    return (
      sourceSignals.some((signal) => queryTokens.includes(signal)) ||
      String(hypothesis.hypothesisText || "").toLowerCase().includes(focus)
    );
  });
  const retractionRequired =
    ["repeated_pattern", "health_correlation", "causation_claim"].includes(requestedClaimType) &&
    Boolean(contradictedHypothesis);
  const memoryDisabled = settings.useMemory === false;
  const requiresFallback =
    crisisDetected ||
    permission.allowFallbackOnly ||
    memoryDisabled ||
    !enoughEvidence ||
    !healthClaimAllowed ||
    retractionRequired ||
    !hypothesisClaimAllowed ||
    confidenceCeiling < permission.minConfidence;
  const blockedReasons = [
    crisisDetected ? "crisis_signal_detected" : null,
    permission.allowFallbackOnly ? `claim_type_requires_fallback:${requestedClaimType}` : null,
    memoryDisabled ? "memory_disabled_by_user" : null,
    !enoughEvidence ? "insufficient_personal_evidence" : null,
    !healthClaimAllowed ? "health_data_not_eligible" : null,
    retractionRequired ? "matching_hypothesis_contradicted_retraction_required" : null,
    !hypothesisClaimAllowed ? "validated_hypothesis_not_supported" : null,
    confidenceCeiling < permission.minConfidence ? "confidence_below_claim_permission" : null,
  ].filter(Boolean);

  return {
    algorithm: "Evidence-Gated Reflective Safety with Claim Permission Matrix",
    version: ALGORITHM_VERSION,
    focus,
    requestedClaimType,
    effectiveClaimType: requestedClaimType,
    claimPermission: permission,
    normalizedMessage,
    querySignals: queryTokens.slice(0, 12),
    healthTopic,
    patternRequest,
    crisisDetected,
    selectedEvidence,
    rankedEvidence: rankedEvidence.slice(0, 5),
    evidenceGraph,
    patternLedger,
    supportedHypotheses,
    contradictedHypotheses,
    contradictedHypothesis: contradictedHypothesis || null,
    retractionRequired,
    evidenceScore: Number((rankedEvidence[0]?.score || 0).toFixed(3)),
    evidenceScoreOk,
    confidenceCeiling: Number(confidenceCeiling.toFixed(3)),
    healthClaimAllowed,
    hypothesisClaimAllowed,
    requiresFallback,
    blockedReasons,
    fallbackQuestion: retractionRequired
      ? `Earlier this looked like a possible pattern, but your newer entries do not support it strongly. What changed recently around ${focus.replace(/_/g, " ")}?`
      : buildFallbackQuestion({ crisisDetected, healthTopic, patternRequest, focus }),
  };
}

export function applyEvidenceGate(payload, gate) {
  const base = {
    ...payload,
    confidence: Number(payload?.confidence || 0),
    evidence: Array.isArray(payload?.evidence) ? payload.evidence : [],
  };
  const generatedText = `${base.insight || ""} ${base.question || ""} ${base.reasoning || ""}`;
  const generatedClaimType = classifyClaimType(generatedText);
  const effectiveClaimType = combineClaimTypes(gate.requestedClaimType, generatedClaimType);
  const claimPermission = CLAIM_PERMISSION_MATRIX[effectiveClaimType] || gate.claimPermission;
  const contradiction = detectContradiction({
    text: generatedText,
    claimType: effectiveClaimType,
    evidenceGraph: gate.evidenceGraph,
    queryTokens: gate.querySignals,
  });
  const runtimeGate = {
    ...gate,
    generatedClaimType,
    effectiveClaimType,
    claimPermission,
    contradiction,
    retraction: gate.retractionRequired
      ? {
          required: true,
          hypothesis: gate.contradictedHypothesis,
          message:
            gate.contradictedHypothesis?.retractionMessage ||
            "Earlier this looked like a possible pattern, but newer journal evidence no longer supports it strongly.",
        }
      : { required: false },
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
      egrs: runtimeGate,
    };
  }

  if ((gate.requiresFallback || contradiction.contradictionDetected || claimPermission.allowFallbackOnly) && !base.fallback) {
    const blockReasons = [
      ...gate.blockedReasons,
      contradiction.contradictionDetected ? "contradiction_against_personal_evidence_graph" : null,
      claimPermission.allowFallbackOnly ? `generated_claim_type_requires_fallback:${effectiveClaimType}` : null,
    ].filter(Boolean);
    return {
      schemaVersion: "1.0",
      insight: "",
      question: gate.fallbackQuestion,
      evidence: [],
      confidence: 0,
      reasoning: gate.retractionRequired
        ? `EGRS retraction gate replaced a contradicted claim: ${blockReasons.join(", ")}.`
        : `EGRS blocked unsupported response: ${blockReasons.join(", ")}.`,
      fallback: true,
      currentFocus: gate.focus,
      egrs: {
        ...runtimeGate,
        blockedReasons: blockReasons,
      },
    };
  }

  const gatedConfidence = base.fallback
    ? base.confidence
    : Math.min(Math.max(base.confidence, 0.62), gate.confidenceCeiling, claimPermission.minConfidence ? 0.92 : 1);

  return {
    ...base,
    confidence: Number(gatedConfidence.toFixed(3)),
    reasoning: `${base.reasoning || ""} EGRS claimType=${effectiveClaimType}, confidence ceiling=${gate.confidenceCeiling}, evidenceScore=${gate.evidenceScore}.`.trim(),
    currentFocus: base.currentFocus || gate.focus,
    egrs: runtimeGate,
  };
}

export function verifyEvidenceGate({ payload, gate, minConfidence }) {
  const fallbackOk = Boolean(payload?.fallback);
  const effectiveClaimType = payload?.egrs?.effectiveClaimType || gate.effectiveClaimType || gate.requestedClaimType;
  const claimPermission = payload?.egrs?.claimPermission || gate.claimPermission;
  const contradiction = payload?.egrs?.contradiction || { contradictionDetected: false };
  const evidenceIds = new Set(gate.selectedEvidence.map((item) => item.journalId));
  const payloadEvidence = Array.isArray(payload?.evidence) ? payload.evidence : [];
  const usesSelectedEvidence = payloadEvidence.some((item) => evidenceIds.has(String(item.journalId || "")));
  const evidenceGateOk =
    fallbackOk ||
    (gate.evidenceScoreOk &&
      (claimPermission.minEvidenceCount === 0 || payloadEvidence.length >= claimPermission.minEvidenceCount) &&
      usesSelectedEvidence);
  const confidenceGateOk = fallbackOk || Number(payload?.confidence || 0) >= Math.max(minConfidence, claimPermission.minConfidence);
  const healthGateOk = fallbackOk || (!claimPermission.requiresHealth || gate.healthClaimAllowed);
  const crisisGateOk = !gate.crisisDetected || fallbackOk;
  const claimPermissionOk = fallbackOk || !claimPermission.allowFallbackOnly;
  const contradictionGateOk = fallbackOk || !contradiction.contradictionDetected;

  return {
    effectiveClaimType,
    evidenceGateOk,
    confidenceGateOk,
    healthGateOk,
    crisisGateOk,
    claimPermissionOk,
    contradictionGateOk,
    acceptedByEvidenceGate:
      evidenceGateOk &&
      confidenceGateOk &&
      healthGateOk &&
      crisisGateOk &&
      claimPermissionOk &&
      contradictionGateOk,
  };
}
