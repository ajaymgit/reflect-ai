import mongoose from "mongoose";
import OpenAI from "openai";
import User from "./models/User.js";
import { env, policyConfig } from "./shared/config/env.js";
import { fetchWithTimeout } from "./shared/utils/fetchWithTimeout.js";
import { logInfo } from "./shared/utils/logger.js";

export async function runStartupChecks() {
  if (!env.JWT_SECRET || !env.MONGO_URI || !env.CLIENT_URL) {
    throw new Error("Critical environment variables missing.");
  }

  if (!policyConfig.minConfidence || !policyConfig.minHealthDays) {
    throw new Error("Policy configuration missing.");
  }

  await mongoose.connect(env.MONGO_URI);
  logInfo("MongoDB connected");

  const usingGeminiCompat = !env.OPENAI_API_KEY && !!env.GEMINI_API_KEY;
  const aiApiKey = env.OPENAI_API_KEY || env.GEMINI_API_KEY;
  const useOllama = String(env.USE_OLLAMA || "true").toLowerCase() !== "false";
  const ollamaBaseUrl = env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const ollamaModel = env.OLLAMA_MODEL || "llama3.2:3b";

  if (useOllama) {
    try {
      // Bounded to 5s -- this runs during server boot, so an unreachable
      // Ollama (rather than one that cleanly refuses the connection)
      // shouldn't be able to hang the entire server's startup.
      const ping = await fetchWithTimeout(`${ollamaBaseUrl}/api/tags`, {}, 5000);
      if (ping.ok) {
        logInfo(`Ollama reachable at ${ollamaBaseUrl}; model target ${ollamaModel}`);
      } else {
        logInfo(`Ollama check returned status ${ping.status}; cloud/fallback will be used when needed`);
      }
    } catch {
      logInfo("Ollama not reachable yet; cloud/fallback will be used when needed");
    }
  }

  if (aiApiKey) {
    const ai = new OpenAI({
      apiKey: aiApiKey,
      ...(usingGeminiCompat ? { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" } : {}),
    });
    if (ai) logInfo("OpenAI client initialized");
    if (usingGeminiCompat) logInfo("Gemini key detected; using OpenAI-compatible Gemini endpoint");
  } else {
    logInfo("No AI key set; using heuristic chat mode");
  }

  const demoExists = await User.findOne({ email: env.DEMO_EMAIL });
  if (!demoExists) {
    logInfo("Demo user not found yet. It will be created by seed.");
  }

  // One-time backfill for accounts created before reminderEnabled/
  // reminderHour existed on the User schema. Mongoose's schema `default`
  // only appears once a document is hydrated in memory -- it does NOT
  // retroactively add the field to what's actually stored in MongoDB, so a
  // raw query like `User.find({ reminderEnabled: true })` would silently
  // match zero pre-existing accounts without this. Safe to run on every
  // boot: only touches documents where the field is still genuinely absent,
  // so it's a no-op after the first run.
  const backfill = await User.updateMany(
    { reminderEnabled: { $exists: false } },
    { $set: { reminderEnabled: true, reminderHour: 20 } },
  );
  if (backfill.modifiedCount > 0) {
    logInfo(`Backfilled default reminder preferences for ${backfill.modifiedCount} existing account(s)`);
  }
}

