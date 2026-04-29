import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const envSchema = z.object({
  PORT: z.string().default("5000"),
  MONGO_URI: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default("7d"),
  JWT_ISSUER: z.string().default("reflectai"),
  JWT_AUDIENCE: z.string().default("reflectai-client"),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  OPENAI_FALLBACK_MODE: z.string().optional(),
  OLLAMA_BASE_URL: z.string().optional(),
  OLLAMA_MODEL: z.string().optional(),
  USE_OLLAMA: z.string().optional(),
  CLIENT_URL: z.string().min(1),
  DEMO_EMAIL: z.string().default("demo@reflectai.com"),
  DEMO_PASSWORD: z.string().default("Demo@123"),
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

