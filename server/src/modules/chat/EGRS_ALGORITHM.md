# Evidence-Gated Reflective Safety Algorithm

## Purpose

The Evidence-Gated Reflective Safety Algorithm (EGRS) makes the chatbot answer only after a deterministic safety layer checks the user's personal evidence. This creates a technical process around the AI model instead of relying on a generic chatbot reply.

Version 2 adds a claim-control layer. The system now decides what type of claim the chatbot is trying to make before it decides whether the claim is allowed.

## Patent-focused method

For every chat message, EGRS performs these steps:

1. Normalize the user's message into searchable signals.
2. Classify the requested or generated claim type, such as current reflection, journal insight, repeated pattern, health correlation, causation claim, directive advice, or crisis response.
3. Build a personal evidence graph from journal signals and co-occurring signal pairs.
4. Derive a personal pattern ledger from repeated graph edges.
5. Rank the user's journal entries by token overlap, focus match, theme presence, emotional intensity, and recency.
6. Select only journal evidence that passes a claim-specific minimum evidence score.
7. Calculate a confidence ceiling from evidence strength, query specificity, recurring themes, and health-data quality.
8. Apply a claim permission matrix that assigns different evidence, confidence, and health-data requirements to each claim type.
9. Check whether the generated response contradicts the personal evidence graph.
10. Block unsupported, unsafe, contradictory, directive, or memory-disabled responses before they reach the user.
11. Replace blocked responses with a focused fallback question.
12. Store the EGRS version, claim type, evidence graph summary, pattern ledger, confidence ceiling, contradiction status, blocked reasons, and gate decisions in the audit log.

## Why this is stronger than a normal chatbot

A normal chatbot flow is:

```text
User message -> AI model -> answer
```

The EGRS flow is:

```text
User message
  -> signal extraction
  -> claim type classification
  -> personal evidence graph
  -> personal pattern ledger
  -> journal evidence ranking
  -> claim-specific permission matrix
  -> adaptive confidence ceiling calculation
  -> health, crisis, and contradiction gates
  -> AI generation
  -> deterministic response verification
  -> answer or fallback
  -> audit log
```

The unique technical focus is not merely that the bot talks about wellness. The unique focus is the claim-controlled response method that decides whether a specific class of reflective claim is allowed.

## Claim permission matrix

Different chatbot statements require different proof:

- Current reflection: can use the current message.
- Journal insight: requires at least one matching journal evidence item.
- Repeated pattern: requires multiple evidence items and a higher confidence level.
- Health correlation: requires multiple evidence items plus eligible health data.
- Causation claim: requires the strongest evidence level and is otherwise blocked.
- Directive advice: is converted into a fallback question.
- Crisis response: bypasses reflection and returns a safety-first prompt.

This makes the app less like a normal chatbot and more like a response-control system.

## Patent-focused claim direction

The strongest narrow claim is:

```text
A computer-implemented method for controlling generated reflective chatbot responses by classifying a generated response into a claim type, constructing a personal evidence graph from user journal records, deriving a pattern ledger from repeated evidence-graph edges, calculating a claim-specific confidence ceiling, detecting contradictions between the generated response and the personal evidence graph, and delivering the generated response only when claim-specific permission rules are satisfied.
```
