# ReflectAI Operations Runbook

## 1) Pre-demo Checklist

- Start MongoDB and confirm `MONGO_URI` connectivity.
- Run `npm run seed` in `server` for representative demo data.
- Start apps with root `npm run dev`.
- Verify `GET /api/health` returns `ok: true`.

## 2) Runtime Health Checks

- API health: `GET /api/health`
- Auth check: `GET /api/auth/me` with demo token
- Chat check: `POST /api/chat/message` with a short prompt

## 3) AI Provider Guardrail

- Default `OPENAI_FALLBACK_MODE=manual` to reduce paid usage.
- If Gemini is rate-limited, UI shows provider alert and pauses.
- Switch to `auto` only when uninterrupted demo continuity is required.

## 4) Incident Response

- **401 bursts**: validate JWT settings (`JWT_SECRET`, issuer, audience).
- **Chat timeouts**: retry once, then switch mode or reduce message size.
- **No evidence replies**: inspect `AuditLog` and chat payload confidence.

## 5) Logs and Traceability

- Request logs include `requestId`, route, status, and duration.
- Error responses return the same `requestId` for debugging.
- Audit records capture policy decisions and evidence IDs per turn.
