# Evidence-Gated Reflective Safety Algorithm

## Purpose

The Evidence-Gated Reflective Safety Algorithm (EGRS) makes the chatbot answer only after a deterministic safety layer checks the user's personal evidence. This creates a technical process around the AI model instead of relying on a generic chatbot reply.

Version 2 adds a claim-control layer. The system now decides what type of claim the chatbot is trying to make before it decides whether the claim is allowed.

The broader app now includes the Experiment-Validated Personal Evidence (EVPE) layer. EVPE turns repeated journal signals into testable personal hypotheses, evaluates later entries as supporting, weakening, contradicting, or neutral evidence, and unlocks stronger chatbot claims only after the hypothesis becomes supported.

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
10. Check whether a strong pattern claim has a supported EVPE hypothesis.
11. Check whether a matching EVPE hypothesis has become contradicted or weakened.
12. Block unsupported, unsafe, contradictory, directive, unvalidated, retracted, or memory-disabled responses before they reach the user.
13. Replace blocked responses with a focused fallback or retraction question.
14. Store the EGRS version, claim type, evidence graph summary, pattern ledger, supported/retracted hypotheses, confidence ceiling, contradiction status, blocked reasons, and gate decisions in the audit log.

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
  -> experiment-validated hypothesis lock
  -> retraction check for weakened or contradicted hypotheses
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

## EVPE hypothesis lifecycle

The hypothesis layer follows this cycle:

```text
Repeated journal signal
  -> detected hypothesis
  -> future entries evaluated as supports / weakens / contradicts / neutral
  -> confidence timeline updated
  -> status becomes supported, testing, weakened, or contradicted
  -> chatbot strong claim lock opens only for supported hypotheses
```

Example:

```text
Hypothesis: meetings may be linked with heavier mood.
Entry A: meeting + stressed -> supports
Entry B: meeting + calm -> contradicts
Entry C: no meeting + stressed -> weakens
Status and confidence update after every journal save.
```

If a hypothesis becomes weakened or contradicted, EGRS treats matching strong claims as retracted. The chatbot must soften the statement and ask for fresh context instead of repeating the old insight as fact.

## Patent-focused claim direction

The strongest narrow claim is:

```text
A computer-implemented method for controlling generated reflective chatbot responses by classifying a generated response into a claim type, constructing a personal evidence graph from user journal records, deriving a pattern ledger from repeated evidence-graph edges, converting repeated signals into experiment-validated personal hypotheses, calculating a claim-specific confidence ceiling, detecting contradictions between the generated response and the personal evidence graph, retracting claims that match weakened or contradicted hypotheses, and delivering the generated response only when claim-specific permission rules and hypothesis claim locks are satisfied.
```
