# ReflectAI / Equoria

Full-stack AI-powered smart journaling and digital health platform.

## Pages Implemented

- `/login`, `/register`, `/forgot-password`, `/reset-password`
- `/dashboard` -- home: mood calendar, Keepsakes globe, health snapshot, Retrospect preview, recent entries
- `/journal/new` -- Write (compose, prompts, time capsules, Keepsakes) and History (paginated archive, search, mood/tag/Keepsakes filters) tabs
- `/retrospect` -- AI-analyzed emotional patterns, mood heatmap, writing rhythm
- `/year-in-review` -- yearly recap
- `/chat` -- AI reflection chat with quick-journal sidebar
- `/health` -- steps/sleep/stress trends, Apple Health sync
- `/settings` -- appearance, reminders, weekly digest, 2FA, Apple Health token, data export
- `/more` -- secondary nav (mobile)
- `/privacy`, `/terms`

## Stack

- Frontend: React + Vite + Tailwind + Framer Motion + Recharts + Three.js/React Three Fiber (Keepsakes globe) + Lucide
- Backend: Node.js + Express + MongoDB + Mongoose + JWT + Zod
- AI: multi-provider with automatic fallback -- OpenAI, Google Gemini, or Ollama (local or Ollama Cloud), selected via env config (see `server/src/shared/config/env.js` and `chat/service.js`). Falls back to a safe heuristic response if no provider is configured or a call fails.

## Data & Privacy

- Journal content, health metrics, chat messages, and Retrospect analyses are encrypted at rest (AES-256-GCM, per-field) -- see `server/src/shared/utils/encryption.js`.
- **Time capsules**: an entry can be sealed with a future reveal date. It's excluded from every listing, search, and AI context until that date arrives -- not even the person who wrote it can read it early (see `shared/utils/visibleJournal.js`, applied across every journal-reading route).
- **Keepsakes**: entries explicitly flagged at write-time as worth revisiting, rendered as an interactive 3D globe.
- Passwords, 2FA secrets/backup codes, password-reset tokens, and the Apple Health sync token are all stored as hashes only, never in plaintext.

## Setup

1. Install dependencies:
   - Root: `npm install`
   - Server: `cd server && npm install`
   - Client: `cd client && npm install`
2. Configure env files:
   - Copy `server/.env.example` to `server/.env`
   - Copy `client/.env.example` to `client/.env`
3. Seed demo data:
   - `npm run seed`
4. Start development:
   - `npm run dev`

## Production-style start

- `npm run start`

## Scheduled scripts (server/)

Not wired to an in-process scheduler -- run manually or via cron:

- `npm run send-reminders` -- hourly; emails a journaling nudge to anyone who hasn't written today and whose chosen reminder hour matches.
- `npm run send-weekly-digest` -- weekly; emails an opt-in recap (entries, streak, dominant mood, health averages) to anyone with the weekly digest enabled.
- `npm run send-capsule-notifications` -- daily; emails anyone whose sealed time capsule's reveal date is today.
- `npm run embed-journals` -- backfills semantic-search embeddings for existing entries.

## Demo Credentials

- Email: `demo@reflectai.com`
- Password: `Demo@123`

## API Overview

- Auth: `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/2fa/*`, `/api/auth/reminder-preferences`, `/api/auth/digest-preferences`, `/api/auth/account` (DELETE -- self-serve account deletion)
- Dashboard: `/api/dashboard/summary`, `/api/dashboard/mood-calendar`
- Journal: `/api/journal/quick-entry`, `/api/journal/entries`, `/api/journal/recent`, `/api/journal/search`, `/api/journal/capsules`, `/api/journal/tags/rename`
- Retrospect: `/api/retrospect/analysis`
- Year in Review: `/api/year-in-review`
- Health: `/api/health-data/overview`, `/api/health-data/sync`, `/api/health-data/manual-entry`
- Chat: `/api/chat/message`, `/api/chat/session`
- Export: `/api/export/all` (JSON), `/api/export/journal.csv`, `/api/export/keepsakes.csv`, `/api/export/health.csv`

## Demo Flow for Faculty

Login -> Dashboard -> New Journal -> Retrospect -> AI Chat -> Health Dashboard

## Safety Rules Enforced

- No evidence = No insight
- Weak health data = no health correlation claims
- Invalid AI response retries then falls back safely
- Audit logging is required for every turn
- Non-medical disclaimer is visible in chat
