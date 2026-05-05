# Environment Policy

## Required

- `PORT`
- `MONGO_URI`
- `JWT_SECRET`
- `CLIENT_URL`

## Auth/Session Security

- `JWT_EXPIRES_IN` (default `7d`)
- `JWT_ISSUER` (default `reflectai`)
- `JWT_AUDIENCE` (default `reflectai-client`)

## AI Provider Routing

- `GEMINI_API_KEY` (primary)
- `OPENAI_API_KEY` (backup)
- `GEMINI_MODEL`
- `OPENAI_MODEL`
- `OPENAI_FALLBACK_MODE` (`manual` or `auto`)

## Local LLM (Optional)

- `USE_OLLAMA`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`

## Demo Seed

- `DEMO_EMAIL`
- `DEMO_PASSWORD`
