# Patent Technical Evidence Package (Draft)

This document maps implemented technical behaviors to filing-ready evidence artifacts.

## A) Claim Support Matrix

1. **Evidence-gated reflective generation**
   - Evidence: chat payload schema enforcement (`insight`, `evidence`, `confidence`, `reasoning`)
   - Artifact: API traces + rejection/fallback examples

2. **Health reliability gating**
   - Evidence: minimum day/completeness/confidence checks before health correlations
   - Artifact: test logs showing health claims blocked when reliability is low

3. **Longitudinal conversational continuity**
   - Evidence: session-aware follow-up generation and anti-repetition behavior
   - Artifact: before/after conversational transcripts

4. **Provider-aware safe orchestration**
   - Evidence: Gemini-first, manual OpenAI fallback with explicit user alert
   - Artifact: rate-limit scenario logs + provider alert screenshots

5. **Audit-grade traceability**
   - Evidence: `AuditLog` write per turn with decisions and evidence IDs
   - Artifact: anonymized audit samples

## B) Recommended Experimental Table (for filing annexure)

- Unsupported-claim rate (baseline vs gated)
- Evidence citation precision (quoted vs non-quoted claims)
- Conversational continuity score over multi-turn sessions
- Policy rejection correctness on low-health-quality windows

## C) Submission Attachments Checklist

- Architecture/dataflow diagram (final)
- API schema snapshot and policy version
- Test reports (backend + frontend smoke + gating checks)
- Anonymized transcript set showing technical effect
