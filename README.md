# ReflectAI / Equoria

Full-stack AI-powered smart journaling and digital health platform.

## Pages Implemented

- `/login`
- `/register`
- `/dashboard`
- `/journal/new`
- `/retrospect`
- `/chat`
- `/health`
- `/settings`

## Stack

- Frontend: React + Vite + Tailwind + Framer Motion + Recharts + Lucide
- Backend: Node.js + Express + MongoDB + Mongoose + JWT + Zod
- AI: OpenAI Responses API (with safe heuristic fallback if key is absent)

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

## Demo Credentials

- Email: `demo@reflectai.com`
- Password: `Demo@123`

## API Overview

- Auth: `/api/auth/register`, `/api/auth/login`, `/api/auth/me`
- Dashboard: `/api/dashboard/summary`
- Journal: `/api/journal/quick-entry`, `/api/journal/recent`
- Retrospect: `/api/retrospect/analysis`
- Health: `/api/health-data/overview`
- Chat: `/api/chat/message`, `/api/chat/session`

## Demo Flow for Faculty

Login -> Dashboard -> New Journal -> Retrospect -> AI Chat -> Health Dashboard

## Safety Rules Enforced

- No evidence = No insight
- Weak health data = no health correlation claims
- Invalid AI response retries then falls back safely
- Audit logging is required for every turn
- Non-medical disclaimer is visible in chat

