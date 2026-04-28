# Evidence-Gated Reflective Safety Algorithm

## Purpose

The Evidence-Gated Reflective Safety Algorithm (EGRS) makes the chatbot answer only after a deterministic safety layer checks the user's personal evidence. This creates a technical process around the AI model instead of relying on a generic chatbot reply.

## Patent-focused method

For every chat message, EGRS performs these steps:

1. Normalize the user's message into searchable signals.
2. Detect whether the message involves health, pattern analysis, or crisis/safety language.
3. Rank the user's journal entries by token overlap, focus match, theme presence, emotional intensity, and recency.
4. Select only journal evidence that passes a minimum evidence score.
5. Calculate a confidence ceiling from evidence strength, query specificity, recurring themes, and health-data quality.
6. Check whether health-related claims are allowed based on health-data eligibility.
7. Block unsupported, unsafe, or memory-disabled responses before they reach the user.
8. Replace blocked responses with a focused fallback question.
9. Store the EGRS version, evidence score, confidence ceiling, blocked reasons, and gate decisions in the audit log.

## Why this is stronger than a normal chatbot

A normal chatbot flow is:

```text
User message -> AI model -> answer
```

The EGRS flow is:

```text
User message
  -> signal extraction
  -> journal evidence ranking
  -> confidence ceiling calculation
  -> health and crisis safety gates
  -> AI generation
  -> deterministic response verification
  -> answer or fallback
  -> audit log
```

The unique technical focus is not merely that the bot talks about wellness. The unique focus is the evidence-gated response-control method that decides whether a reflective answer is allowed.
