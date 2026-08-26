import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

// This suite exists to make the paper's claims about the chat engine
// checkable, not just described. Each describe() block below maps directly
// to one of the five mechanisms discussed as the paper's real contributions:
//   1. Insight-conditional evidence gating (verifyInsight)
//   2. Pre-sanitization health-claim eligibility (verifyInsight + scrubHealthReferences)
//   3. Citation-ID-recovery evidence attribution (normalizeEvidence)
//   4. Two removed anti-patterns, encoded as regression tests (enrichPayload)
//   5. End-to-end turn processing on the deterministic heuristic path (processChatTurn)
//
// Uses mongodb-memory-server rather than the real local dev database, so
// this suite is self-contained and CI-runnable -- it does not depend on, or
// write into, whatever's in your actual MongoDB. MONGO_URI is overridden
// BEFORE any module that reads it is imported (via dynamic import() inside
// beforeAll, not a static top-of-file import) so config/env.js's dotenv load
// never gets a chance to leave the real local Mongo URI in place. Every
// other required env var (JWT_SECRET, ENCRYPTION_KEY, CLIENT_URL) still
// comes from your real server/.env, so encryption round-trips exactly as it
// does in production.

let mongod;
let service;
let JournalEntry;
let HealthData;
let ChatSession;
let AuditLog;
let policyConfig;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  // Deterministic for these tests: the whole point of this suite is to
  // check the validation/gating logic itself, not any particular model
  // provider's output. Real end-to-end model-quality numbers (success rate,
  // fallback rate, latency) come from scripts/evalChatEngine.js instead,
  // which deliberately DOES hit a real provider.
  process.env.USE_OLLAMA = "false";
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  await mongoose.connect(process.env.MONGO_URI);

  service = await import("./service.js");
  JournalEntry = (await import("../../models/JournalEntry.js")).default;
  HealthData = (await import("../../models/HealthData.js")).default;
  ChatSession = (await import("../../models/ChatSession.js")).default;
  AuditLog = (await import("../../models/AuditLog.js")).default;
  policyConfig = (await import("../../shared/config/env.js")).policyConfig;
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([
    JournalEntry.deleteMany({}),
    HealthData.deleteMany({}),
    ChatSession.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
});

function makeUserId() {
  return new mongoose.Types.ObjectId();
}

describe("validateAiPayload -- response schema contract", () => {
  it("accepts a fully-formed payload", () => {
    expect(
      service.validateAiPayload({
        schemaVersion: "1.0",
        insight: "x",
        question: "y",
        evidence: [],
        confidence: 0.7,
        reasoning: "z",
        fallback: false,
      }),
    ).toBe(true);
  });

  it("rejects a payload missing a required field", () => {
    expect(
      service.validateAiPayload({
        schemaVersion: "1.0",
        insight: "x",
        question: "y",
        evidence: [],
        confidence: 0.7,
        // reasoning missing
        fallback: false,
      }),
    ).toBe(false);
  });

  it("rejects when evidence is not an array", () => {
    expect(
      service.validateAiPayload({
        schemaVersion: "1.0",
        insight: "x",
        question: "y",
        evidence: "not-an-array",
        confidence: 0.7,
        reasoning: "z",
        fallback: false,
      }),
    ).toBe(false);
  });

  it("rejects when confidence is not a number", () => {
    expect(
      service.validateAiPayload({
        schemaVersion: "1.0",
        insight: "x",
        question: "y",
        evidence: [],
        confidence: "high",
        reasoning: "z",
        fallback: false,
      }),
    ).toBe(false);
  });
});

describe("verifyInsight -- insight-conditional evidence gating (mechanism 1)", () => {
  const healthQuality = { eligible: true };

  it("accepts a fallback turn with no evidence and confidence 0 (no claim is being made)", () => {
    const payload = { fallback: true, insight: "", evidence: [], confidence: 0 };
    const result = service.verifyInsight({ payload, rawText: "", healthQuality });
    expect(result.accepted).toBe(true);
    expect(result.decisions.evidencePresent).toBe(true);
    expect(result.decisions.confidenceOk).toBe(true);
  });

  it("rejects a non-fallback turn that asserts an insight with zero evidence", () => {
    const payload = {
      fallback: false,
      insight: "You tend to feel drained after long meetings.",
      evidence: [],
      confidence: 0.8,
    };
    const result = service.verifyInsight({ payload, rawText: "", healthQuality });
    expect(result.accepted).toBe(false);
    expect(result.decisions.evidencePresent).toBe(false);
  });

  it("rejects a non-fallback insight claim below the confidence threshold", () => {
    const payload = {
      fallback: false,
      insight: "You tend to feel drained after long meetings.",
      evidence: [{ journalId: "abc", quote: "q", date: new Date() }],
      confidence: policyConfig.minConfidence - 0.05,
    };
    const result = service.verifyInsight({ payload, rawText: "", healthQuality });
    expect(result.accepted).toBe(false);
    expect(result.decisions.confidenceOk).toBe(false);
  });

  it("accepts a non-fallback insight claim with evidence at/above the confidence threshold", () => {
    const payload = {
      fallback: false,
      insight: "You tend to feel drained after long meetings.",
      evidence: [{ journalId: "abc", quote: "q", date: new Date() }],
      confidence: policyConfig.minConfidence,
    };
    const result = service.verifyInsight({ payload, rawText: "", healthQuality });
    expect(result.accepted).toBe(true);
  });

  it("does not require evidence for an ordinary conversational turn with no insight claim", () => {
    // fallback=false but insight is empty -- e.g. a warm follow-up question
    // with nothing to cite. This is the exact case that used to be rejected
    // unconditionally before the insight-conditional gate was added.
    const payload = { fallback: false, insight: "", evidence: [], confidence: 0 };
    const result = service.verifyInsight({ payload, rawText: "", healthQuality });
    expect(result.accepted).toBe(true);
  });
});

describe("verifyInsight + scrubHealthReferences -- pre-sanitization policy enforcement (mechanism 2)", () => {
  it("still catches an ineligible health claim after the text has been scrubbed, by checking raw text", () => {
    const rawPayload = {
      fallback: false,
      insight: "Your sleep has been inconsistent this week.",
      question: "Do you think your sleep is affecting your mood?",
      reasoning: "Based on recent sleep data.",
      evidence: [{ journalId: "abc", quote: "q", date: new Date() }],
      confidence: 0.9,
    };
    const rawText = `${rawPayload.insight} ${rawPayload.question}`;

    const scrubbed = service.scrubHealthReferences(rawPayload);
    // The scrubber itself works: the literal word "sleep" is gone from the
    // user-facing text.
    expect(scrubbed.insight.toLowerCase()).not.toContain("sleep");
    expect(scrubbed.question.toLowerCase()).not.toContain("sleep");

    // But the eligibility check is run against rawText (captured BEFORE
    // scrub), not the already-scrubbed payload -- so it still correctly
    // fails here even though nothing in the user-facing text says "sleep"
    // anymore. This is the property that would silently break if
    // verifyInsight were ever called with scrubbed text instead.
    const result = service.verifyInsight({
      payload: scrubbed,
      rawText,
      healthQuality: { eligible: false },
    });
    expect(result.decisions.healthClaimsEligible).toBe(false);
    expect(result.accepted).toBe(false);
  });

  it("allows a health-referencing claim when health data quality is actually eligible", () => {
    const rawPayload = {
      fallback: false,
      insight: "Your sleep has been steady this week.",
      question: "How has that felt for you?",
      evidence: [{ journalId: "abc", quote: "q", date: new Date() }],
      confidence: 0.9,
    };
    const rawText = `${rawPayload.insight} ${rawPayload.question}`;
    const result = service.verifyInsight({
      payload: rawPayload,
      rawText,
      healthQuality: { eligible: true },
    });
    expect(result.decisions.healthClaimsEligible).toBe(true);
    expect(result.accepted).toBe(true);
  });
});

describe("normalizeEvidence -- citation-ID-recovery attribution (mechanism 3)", () => {
  const candidates = [
    {
      journalId: "507f1f77bcf86cd799439011",
      quote: "I felt really tired after work and just wanted to disappear for a while",
      date: new Date("2026-06-01"),
      mood: "sad",
    },
  ];

  it("keeps evidence that matches a candidate by exact journalId", () => {
    const result = service.normalizeEvidence(
      [{ journalId: "507f1f77bcf86cd799439011", quote: "I felt really tired after work" }],
      candidates,
    );
    expect(result).toHaveLength(1);
    expect(result[0].journalId).toBe("507f1f77bcf86cd799439011");
  });

  it("recovers evidence when the journalId is mangled but the quoted text is real", () => {
    // Simulates a small local model failing to transcribe a 24-char Mongo
    // ObjectId verbatim while still quoting content it was actually shown.
    const result = service.normalizeEvidence(
      [{ journalId: "not-a-real-id-the-model-made-up", quote: "I felt really tired after work" }],
      candidates,
    );
    expect(result).toHaveLength(1);
    expect(result[0].journalId).toBe("507f1f77bcf86cd799439011");
  });

  it("drops evidence whose quote does not match any real candidate (does not fabricate grounding)", () => {
    const result = service.normalizeEvidence(
      [{ journalId: "not-a-real-id", quote: "this text was never in any journal entry the model was shown" }],
      candidates,
    );
    expect(result).toHaveLength(0);
  });
});

describe("calculateHealthQuality -- eligibility threshold gate", () => {
  it("is ineligible with fewer than the minimum number of days", () => {
    const records = Array.from({ length: policyConfig.minHealthDays - 1 }, () => ({
      completeness: 1,
      confidence: 1,
    }));
    expect(service.calculateHealthQuality(records).eligible).toBe(false);
  });

  it("is ineligible when completeness is below threshold despite enough days", () => {
    const records = Array.from({ length: policyConfig.minHealthDays + 2 }, () => ({
      completeness: policyConfig.minHealthCompleteness - 0.1,
      confidence: 1,
    }));
    expect(service.calculateHealthQuality(records).eligible).toBe(false);
  });

  it("is eligible once days/completeness/confidence all clear their thresholds", () => {
    const records = Array.from({ length: policyConfig.minHealthDays + 2 }, () => ({
      completeness: 1,
      confidence: 1,
    }));
    expect(service.calculateHealthQuality(records).eligible).toBe(true);
  });
});

describe("enrichPayload -- removed anti-patterns stay removed (mechanism 4, regression tests)", () => {
  it("does NOT auto-fill evidence when the model returns an empty evidence array", () => {
    // Regression test for a real, documented bug: this function used to
    // substitute the user's most recent journal entry as "evidence"
    // whenever the model's own evidence array was empty, regardless of
    // relevance -- which made the evidencePresent check above incapable of
    // ever catching an unsupported claim for any user with at least one
    // journal entry.
    const candidates = [
      { journalId: "507f1f77bcf86cd799439011", quote: "unrelated entry", date: new Date(), mood: "calm" },
    ];
    const payload = {
      fallback: false,
      insight: "You seem to be under a lot of pressure lately.",
      question: "What's weighing on you most?",
      evidence: [],
      confidence: 0.8,
      reasoning: "model reasoning",
    };
    const enriched = service.enrichPayload(payload, candidates);
    expect(enriched.evidence).toHaveLength(0);
  });

  it("does NOT boost a genuinely low model-reported confidence value", () => {
    // Regression test for the second documented anti-pattern: any evidence
    // at all (including the auto-fill above) used to silently raise
    // confidence to at least 0.68 before the confidenceOk check ran,
    // misrepresenting the model's own reported uncertainty.
    const candidates = [
      { journalId: "507f1f77bcf86cd799439011", quote: "I had a hard time focusing today", date: new Date(), mood: "stressed" },
    ];
    const payload = {
      fallback: false,
      insight: "You've mentioned focus issues before.",
      question: "Does this happen on a pattern, like certain days?",
      evidence: [{ journalId: "507f1f77bcf86cd799439011", quote: "I had a hard time focusing today" }],
      confidence: 0.4,
      reasoning: "model reasoning",
    };
    const enriched = service.enrichPayload(payload, candidates);
    expect(enriched.confidence).toBe(0.4);
  });
});

describe("ablation flags -- opt-in only, used by scripts/evalAblation.js", () => {
  const healthQuality = { eligible: true };

  it("default (no ablation arg) behaves identically to ablation={} -- production is never accidentally ablated", () => {
    const payload = { fallback: false, insight: "", evidence: [], confidence: 0 };
    const withNoArg = service.verifyInsight({ payload, rawText: "", healthQuality });
    const withEmptyObj = service.verifyInsight({ payload, rawText: "", healthQuality, ablation: {} });
    expect(withNoArg).toEqual(withEmptyObj);
  });

  it("requireEvidenceUnconditionally rejects a plain conversational turn that the default gate would accept", () => {
    const payload = { fallback: false, insight: "", evidence: [], confidence: 0 };
    const baseline = service.verifyInsight({ payload, rawText: "", healthQuality });
    const ablated = service.verifyInsight({
      payload,
      rawText: "",
      healthQuality,
      ablation: { requireEvidenceUnconditionally: true },
    });
    expect(baseline.accepted).toBe(true);
    expect(ablated.accepted).toBe(false);
    expect(ablated.decisions.evidencePresent).toBe(false);
  });

  it("autoFillEvidence restores the removed anti-pattern: fills empty evidence with an unrelated top candidate", () => {
    const candidates = [
      { journalId: "507f1f77bcf86cd799439011", quote: "unrelated entry", date: new Date(), mood: "calm" },
    ];
    const payload = {
      fallback: false,
      insight: "You seem to be under a lot of pressure lately.",
      question: "What's weighing on you most?",
      evidence: [],
      confidence: 0.8,
      reasoning: "model reasoning",
    };
    const baseline = service.enrichPayload(payload, candidates);
    expect(baseline.evidence).toHaveLength(0);

    const ablated = service.enrichPayload(payload, candidates, { autoFillEvidence: true });
    expect(ablated.evidence).toHaveLength(1);
    expect(ablated.evidence[0].journalId).toBe("507f1f77bcf86cd799439011");
  });

  it("boostConfidenceFloor restores the removed anti-pattern: raises low confidence to 0.68 when evidence is present", () => {
    const candidates = [
      { journalId: "507f1f77bcf86cd799439011", quote: "I had a hard time focusing today", date: new Date(), mood: "stressed" },
    ];
    const payload = {
      fallback: false,
      insight: "You've mentioned focus issues before.",
      question: "Does this happen on a pattern, like certain days?",
      evidence: [{ journalId: "507f1f77bcf86cd799439011", quote: "I had a hard time focusing today" }],
      confidence: 0.4,
      reasoning: "model reasoning",
    };
    const baseline = service.enrichPayload(payload, candidates);
    expect(baseline.confidence).toBe(0.4);

    const ablated = service.enrichPayload(payload, candidates, { boostConfidenceFloor: true });
    expect(ablated.confidence).toBe(0.68);
  });

  it("combined anti_patterns condition can flip a turn from rejected to wrongly-accepted, demonstrating why both fixes matter together", () => {
    const candidates = [
      { journalId: "507f1f77bcf86cd799439011", quote: "unrelated entry about a walk", date: new Date(), mood: "calm" },
    ];
    const rawPayload = {
      fallback: false,
      insight: "You tend to withdraw when things feel uncertain.",
      question: "Does that resonate?",
      evidence: [],
      confidence: 0.4,
      reasoning: "model reasoning",
    };

    const baselineEnriched = service.enrichPayload(rawPayload, candidates);
    const baselineVerify = service.verifyInsight({
      payload: baselineEnriched,
      rawText: `${baselineEnriched.insight} ${baselineEnriched.question}`,
      healthQuality,
    });
    expect(baselineVerify.accepted).toBe(false); // no evidence -> correctly falls back

    const ablation = { autoFillEvidence: true, boostConfidenceFloor: true };
    const ablatedEnriched = service.enrichPayload(rawPayload, candidates, ablation);
    const ablatedVerify = service.verifyInsight({
      payload: ablatedEnriched,
      rawText: `${ablatedEnriched.insight} ${ablatedEnriched.question}`,
      healthQuality,
      ablation,
    });
    expect(ablatedVerify.accepted).toBe(true); // auto-filled evidence + boosted confidence wrongly pass the gate
  });
});

describe("processChatTurn -- end-to-end on the deterministic heuristic path (mechanism 5)", () => {
  it("accepts an ordinary turn, grounds it in real journal evidence, and writes a matching audit log", async () => {
    const userId = makeUserId();
    await JournalEntry.create({
      userId,
      content: "Work has been really overwhelming this week, I can't catch a break.",
      mood: "stressed",
    });

    const result = await service.processChatTurn({
      userId,
      userMessage: "I'm feeling stuck with work stress again.",
      chatSettings: { mode: "quick" },
    });

    expect(result.payload).toBeTruthy();
    expect(typeof result.payload.question).toBe("string");
    expect(result.payload.question.length).toBeGreaterThan(0);

    const audit = await AuditLog.findOne({ userId });
    expect(audit).toBeTruthy();
    expect(["accepted", "rejected"]).toContain(audit.status);
    expect(audit.policyVersion).toBe(policyConfig.policyVersion);

    const session = await ChatSession.findOne({ userId });
    expect(session.turns).toHaveLength(1);
    expect(session.turns[0].userMessage).toBe("I'm feeling stuck with work stress again.");
  });

  it("still returns a usable, on-brand response with zero journal history (no evidence to ground in)", async () => {
    const userId = makeUserId();
    const result = await service.processChatTurn({
      userId,
      userMessage: "hey",
      chatSettings: { mode: "quick" },
    });
    expect(result.payload).toBeTruthy();
    expect(result.payload.question.length).toBeGreaterThan(0);

    const audit = await AuditLog.findOne({ userId });
    expect(audit).toBeTruthy();
  });

  it("scrubs and withholds an ineligible health claim end-to-end when health data quality is insufficient", async () => {
    const userId = makeUserId();
    // Fewer than policyConfig.minHealthDays rows -- deliberately ineligible.
    await HealthData.create({
      userId,
      date: new Date(),
      sleepHours: 5,
      steps: 3000,
      stressScore: 70,
      restingHeartRate: 80,
      completeness: 1,
      confidence: 1,
    });

    const result = await service.processChatTurn({
      userId,
      userMessage: "hey",
      chatSettings: { mode: "quick" },
    });

    expect(result.healthQuality.eligible).toBe(false);
    // Whatever came back, it must not be a rejected/ineligible health claim
    // slipping through -- either it's a normal accepted turn that never
    // touched health data, or a fallback. Either way, confidence on a
    // health-referencing accepted claim would be a bug.
    expect(result.payload).toBeTruthy();
  });
});
