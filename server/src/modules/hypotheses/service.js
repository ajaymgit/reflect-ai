import JournalEntry from "../../models/JournalEntry.js";
import PersonalHypothesis from "../../models/PersonalHypothesis.js";

const HYPOTHESIS_VERSION = "EVPE-1.0.0";

const SIGNAL_GROUPS = [
  { signal: "meetings", focus: "workload", tokens: ["meeting", "meetings", "call", "calls", "deadline", "deadlines", "workload", "work"] },
  { signal: "sleep", focus: "energy", tokens: ["sleep", "slept", "tired", "exhausted", "fatigue", "drained"] },
  { signal: "movement", focus: "recovery", tokens: ["walk", "walking", "exercise", "movement", "steps", "run", "gym"] },
  { signal: "relationships", focus: "relationships", tokens: ["friend", "partner", "family", "relationship", "lonely", "miss"] },
  { signal: "focus", focus: "workload", tokens: ["focus", "scattered", "distracted", "productive", "creative"] },
  { signal: "calm", focus: "calm", tokens: ["calm", "grounded", "breathing", "peace", "quiet", "reset"] },
];

const MOOD_POLARITY = {
  happy: "positive",
  calm: "positive",
  reflective: "neutral",
  sad: "heavy",
  stressed: "heavy",
  angry: "heavy",
};

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectSignals(entry) {
  const text = normalizeText(`${entry.content || ""} ${(entry.themes || []).join(" ")}`);
  return SIGNAL_GROUPS.filter((group) => group.tokens.some((token) => text.includes(token)));
}

function signalLabel(signal) {
  return String(signal || "pattern").replace(/_/g, " ");
}

function targetLabel(target) {
  if (target === "heavy") return "heavier mood";
  if (target === "positive") return "steadier mood";
  return "reflective mood";
}

function buildHypothesisKey(signal, targetState) {
  return `${signal}:${targetState}`;
}

function getStatus(confidence, supportCount, contradictionCount) {
  if (contradictionCount >= Math.max(2, supportCount)) return "contradicted";
  if (confidence >= 0.72 && supportCount >= 3) return "supported";
  if (confidence <= 0.42 && contradictionCount > supportCount) return "weakened";
  return "testing";
}

function calculateConfidence({ supportCount, contradictionCount, neutralCount }) {
  const total = supportCount + contradictionCount + neutralCount;
  if (!total) return 0.35;
  const supportRatio = supportCount / total;
  const contradictionPenalty = contradictionCount / total;
  return Math.max(0.12, Math.min(0.92, Number((0.32 + supportRatio * 0.58 - contradictionPenalty * 0.28).toFixed(3))));
}

function evaluateEntryAgainstHypothesis(entry, hypothesis) {
  const signalSet = new Set(detectSignals(entry).map((item) => item.signal));
  const hasAnySourceSignal = hypothesis.sourceSignals.some((signal) => signalSet.has(signal));
  const targetState = hypothesis.hypothesisKey.split(":")[1] || "neutral";
  const polarity = MOOD_POLARITY[entry.mood] || "neutral";
  const targetMatched = polarity === targetState;

  if (hasAnySourceSignal && targetMatched) return "supports";
  if (hasAnySourceSignal && !targetMatched) return "contradicts";
  if (!hasAnySourceSignal && targetMatched) return "weakens";
  return "neutral";
}

function serializeHypothesis(hypothesis) {
  const plain = typeof hypothesis.toObject === "function" ? hypothesis.toObject() : hypothesis;
  return {
    id: String(plain._id),
    hypothesisKey: plain.hypothesisKey,
    hypothesisText: plain.hypothesisText,
    sourceSignals: plain.sourceSignals || [],
    focus: plain.focus,
    status: plain.status,
    confidence: plain.confidence,
    supportCount: plain.supportCount,
    contradictionCount: plain.contradictionCount,
    neutralCount: plain.neutralCount,
    claimLock: plain.claimLock,
    retractionMessage:
      plain.status === "contradicted" || plain.status === "weakened"
        ? `Earlier this pattern looked possible, but newer journal evidence does not support it strongly: ${plain.hypothesisText}`
        : "",
    evidence: (plain.evidence || []).slice(-8),
    confidenceTimeline: (plain.confidenceTimeline || []).slice(-12),
    lastEvaluatedAt: plain.lastEvaluatedAt,
  };
}

async function updateHypothesisFromEntries(hypothesis, entries) {
  const evidenceById = new Map(hypothesis.evidence.map((item) => [String(item.journalId), item]));
  let changed = false;

  for (const entry of entries) {
    const entryId = String(entry._id);
    const verdict = evaluateEntryAgainstHypothesis(entry, hypothesis);
    const evidencePoint = {
      journalId: entry._id,
      quote: String(entry.content || "").slice(0, 180),
      mood: entry.mood,
      date: entry.createdAt,
      verdict,
    };

    const existing = evidenceById.get(entryId);
    if (!existing) {
      hypothesis.evidence.push(evidencePoint);
      changed = true;
      continue;
    }
    if (existing.verdict !== verdict) {
      existing.verdict = verdict;
      changed = true;
    }
  }

  const supportCount = hypothesis.evidence.filter((item) => item.verdict === "supports").length;
  const contradictionCount = hypothesis.evidence.filter((item) => item.verdict === "contradicts" || item.verdict === "weakens").length;
  const neutralCount = hypothesis.evidence.filter((item) => item.verdict === "neutral").length;
  const confidence = calculateConfidence({ supportCount, contradictionCount, neutralCount });
  const status = getStatus(confidence, supportCount, contradictionCount);
  const strongClaimsAllowed = status === "supported" && confidence >= 0.72;

  if (
    changed ||
    hypothesis.supportCount !== supportCount ||
    hypothesis.contradictionCount !== contradictionCount ||
    hypothesis.neutralCount !== neutralCount ||
    hypothesis.confidence !== confidence ||
    hypothesis.status !== status
  ) {
    hypothesis.supportCount = supportCount;
    hypothesis.contradictionCount = contradictionCount;
    hypothesis.neutralCount = neutralCount;
    hypothesis.confidence = confidence;
    hypothesis.status = status;
    hypothesis.claimLock = {
      strongClaimsAllowed,
      reason: strongClaimsAllowed
        ? "Hypothesis has enough repeated support for stronger chatbot claims."
        : "Hypothesis is still testing or contradicted, so strong chatbot claims are locked.",
    };
    hypothesis.lastEvaluatedAt = new Date();
    hypothesis.confidenceTimeline.push({
      confidence,
      supportCount,
      contradictionCount,
      at: new Date(),
    });
    await hypothesis.save();
  }

  return hypothesis;
}

async function createMissingHypotheses(userId, entries) {
  const signalStats = new Map();
  for (const entry of entries) {
    const polarity = MOOD_POLARITY[entry.mood] || "neutral";
    if (polarity === "neutral") continue;
    for (const signal of detectSignals(entry)) {
      const key = buildHypothesisKey(signal.signal, polarity);
      const existing = signalStats.get(key) || { ...signal, targetState: polarity, count: 0 };
      existing.count += 1;
      signalStats.set(key, existing);
    }
  }

  const candidates = Array.from(signalStats.values())
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const created = [];
  for (const candidate of candidates) {
    const hypothesisKey = buildHypothesisKey(candidate.signal, candidate.targetState);
    const hypothesis = await PersonalHypothesis.findOneAndUpdate(
      { userId, hypothesisKey },
      {
        $setOnInsert: {
          userId,
          hypothesisKey,
          hypothesisText: `${signalLabel(candidate.signal)} may be linked with ${targetLabel(candidate.targetState)}.`,
          sourceSignals: [candidate.signal],
          focus: candidate.focus,
          status: "detected",
          confidence: 0.35,
          confidenceTimeline: [{ confidence: 0.35, supportCount: 0, contradictionCount: 0 }],
          claimLock: {
            strongClaimsAllowed: false,
            reason: "Hypothesis was detected but has not been validated yet.",
          },
        },
      },
      { upsert: true, new: true },
    );
    created.push(hypothesis);
  }
  return created;
}

export async function refreshHypothesesForUser(userId) {
  const entries = await JournalEntry.find({ userId }).sort({ createdAt: -1 }).limit(60);
  await createMissingHypotheses(userId, entries);
  const hypotheses = await PersonalHypothesis.find({ userId }).sort({ confidence: -1, updatedAt: -1 }).limit(20);
  const updated = [];
  for (const hypothesis of hypotheses) {
    updated.push(await updateHypothesisFromEntries(hypothesis, entries));
  }
  return getHypothesisSummary(userId, updated);
}

export async function refreshHypothesesForEntry(entry) {
  const entries = await JournalEntry.find({ userId: entry.userId }).sort({ createdAt: -1 }).limit(60);
  await createMissingHypotheses(entry.userId, entries);
  const hypotheses = await PersonalHypothesis.find({ userId: entry.userId });
  return Promise.all(hypotheses.map((hypothesis) => updateHypothesisFromEntries(hypothesis, entries)));
}

export async function getHypothesisSummary(userId, prefetched = null) {
  const hypotheses =
    prefetched || (await PersonalHypothesis.find({ userId }).sort({ confidence: -1, updatedAt: -1 }).limit(20));
  const serialized = hypotheses.map(serializeHypothesis);
  return {
    version: HYPOTHESIS_VERSION,
    total: serialized.length,
    supported: serialized.filter((item) => item.status === "supported").length,
    testing: serialized.filter((item) => item.status === "testing" || item.status === "detected").length,
    contradicted: serialized.filter((item) => item.status === "contradicted" || item.status === "weakened").length,
    hypotheses: serialized,
    supportedHypotheses: serialized.filter((item) => item.claimLock?.strongClaimsAllowed),
    contradictedHypotheses: serialized.filter((item) => item.status === "contradicted" || item.status === "weakened"),
  };
}

export function getSupportedHypotheses(summaryOrHypotheses = []) {
  const hypotheses = Array.isArray(summaryOrHypotheses)
    ? summaryOrHypotheses.map(serializeHypothesis)
    : summaryOrHypotheses.supportedHypotheses || [];
  return hypotheses.filter((hypothesis) => hypothesis.claimLock?.strongClaimsAllowed);
}

export const hypothesisVersion = HYPOTHESIS_VERSION;
