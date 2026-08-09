import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const WEAK_JWT_SECRETS = new Set([
  "replace_with_secure_value",
  "secret",
  "changeme",
  "your_jwt_secret_here",
]);

const WEAK_ENCRYPTION_KEYS = new Set([
  "replace_with_secure_value",
  "secret",
  "changeme",
]);

function isValidEncryptionKey(v) {
  if (WEAK_ENCRYPTION_KEYS.has(v)) return false;
  try {
    // AES-256-GCM needs exactly a 32-byte (256-bit) key -- checked by
    // decoding rather than just checking string length, since the .env
    // value is base64 text, not the raw key bytes themselves.
    return Buffer.from(v, "base64").length === 32;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  PORT: z.string().default("5000"),
  MONGO_URI: z.string().min(1),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters long")
    .refine((v) => !WEAK_JWT_SECRETS.has(v), {
      message: "JWT_SECRET is still set to a known placeholder value (e.g. the .env.example default). Generate a real secret, e.g.: node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\"",
    }),
  // Field-level encryption at rest for journal content and health metrics
  // (see shared/utils/encryption.js). A base64-encoded 32-byte AES-256-GCM
  // key -- generate one with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  // Losing this key makes all previously-encrypted data permanently
  // unreadable, and it must never be committed to source control (kept in
  // .env, which is gitignored, same as JWT_SECRET).
  ENCRYPTION_KEY: z
    .string()
    .refine(isValidEncryptionKey, {
      message: "ENCRYPTION_KEY must be a base64-encoded 32-byte key. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    }),
  // .transform() (not .refine()) here on purpose: an unfilled placeholder
  // isn't invalid config worth crashing startup over the way a weak
  // JWT_SECRET is -- it just means "no real key," so it's silently treated
  // as unset instead. This is what the very first "Chat is always broken"
  // bug in this project actually traced back to: chat/service.js treats
  // `env.OPENAI_API_KEY || env.GEMINI_API_KEY` being ANY non-empty string as
  // "a provider is configured," so copying .env.example to .env without
  // editing these two lines made it try to call OpenAI with the literal
  // string "replace_with_openai_key" as the API key on every message,
  // fail, and (before that bug was separately fixed) surface one hardcoded
  // apology forever. Clearing known placeholders here closes off that
  // failure mode at the source, not just downstream of it.
  OPENAI_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v === "replace_with_openai_key" ? undefined : v)),
  GEMINI_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v === "replace_with_gemini_key" ? undefined : v)),
  AI_MODEL: z.string().optional(),
  OLLAMA_BASE_URL: z.string().optional(),
  OLLAMA_MODEL: z.string().optional(),
  USE_OLLAMA: z.string().optional(),
  CLIENT_URL: z.string().min(1),
  DEMO_EMAIL: z.string().default("demo@reflectai.com"),
  DEMO_PASSWORD: z.string().default("Demo@123"),
  // Used by POST /api/auth/forgot-password to actually send the reset email
  // (see shared/utils/mailer.js). Optional so the app still boots without
  // them -- forgot-password degrades to logging the reset link server-side
  // instead of emailing it, rather than crashing at startup.
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default("ReflectAI <onboarding@resend.dev>"),
  // Controls Express's "trust proxy" setting (see src/index.js), which
  // determines whether req.ip comes from the real client or gets taken from
  // an X-Forwarded-For header. Every rate limiter in this app (login,
  // refresh, forgot-password, 2FA) is keyed by req.ip -- left at the default
  // of "false", running behind ANY reverse proxy/load balancer (Nginx,
  // Render, Fly.io, Heroku, etc.) makes req.ip the proxy's own IP for every
  // request, collapsing all users into one shared rate-limit bucket (or
  // worse, becoming spoofable). Set this to "1" if there is exactly one
  // proxy in front of this server (the common case), or consult
  // https://expressjs.com/en/guide/behind-proxies.html for other topologies.
  // Leave unset for local/direct (no proxy) use.
  TRUST_PROXY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;

export const policyConfig = {
  policyVersion: "1.0.0",
  minConfidence: 0.65,
  minHealthDays: 7,
  minHealthCompleteness: 0.7,
  minHealthConfidence: 0.65,
  chatRateLimit: {
    max: 30,
    windowMs: 15 * 60 * 1000,
  },
};

