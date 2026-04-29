import { describe, expect, it } from "vitest";
import {
  buildContextFollowUp,
  buildIntentPayload,
  detectIntent,
  normalizeChatSettings,
  verifyInsight,
} from "../src/modules/chat/service.js";

describe("chat helper behavior", () => {
  it("detects topic switch intent", () => {
    expect(detectIntent("let's talk about something else")).toBe("topic_switch");
  });

  it("detects positive outcome intent for achievement phrases", () => {
    expect(detectIntent("I passed my lab exam")).toBe("positive_checkin");
  });

  it("normalizes chat settings safely", () => {
    const settings = normalizeChatSettings({
      mode: "analysis",
      responseStyle: 120,
      useMemory: false,
    });

    expect(settings).toEqual({
      mode: "analysis",
      responseStyle: 100,
      useMemory: false,
    });
  });

  it("creates intent payload for greeting", () => {
    const payload = buildIntentPayload({
      intent: "greeting",
      candidates: [{ journalId: "1", quote: "test", date: new Date().toISOString() }],
    });

    expect(payload?.question).toMatch(/how are you feeling/i);
    expect(payload?.fallback).toBe(false);
  });

  it("creates context follow-up for clarification prompt", () => {
    const payload = buildContextFollowUp({
      userMessage: "yes",
      sessionTurns: [{ aiResponse: "Great, let us keep it simple. Which one should we start with: mood, relationships, work, or energy?" }],
    });

    expect(payload?.currentFocus).toBe("user_selected");
    expect(payload?.question).toMatch(/pick one to start/i);
  });

  it("keeps positive thread for achievement follow-up", () => {
    const payload = buildContextFollowUp({
      userMessage: "because i passed my lab exam",
      sessionTurns: [{ aiResponse: "Love that. What do you think made today feel better for you?" }],
    });

    expect(payload?.currentFocus).toBe("positive_state");
    expect(payload?.question).toMatch(/helped you perform well/i);
  });

  it("rejects health claims when health reliability is low", () => {
    const verdict = verifyInsight({
      payload: {
        fallback: false,
        evidence: [{ journalId: "1", quote: "x", date: "2025-01-01" }],
        confidence: 0.75,
        insight: "Your sleep has dropped and stress is rising.",
        question: "When did this pattern begin?",
      },
      healthQuality: { eligible: false },
    });

    expect(verdict.accepted).toBe(false);
    expect(verdict.decisions.healthClaimsEligible).toBe(false);
  });
});
