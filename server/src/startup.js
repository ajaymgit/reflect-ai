import mongoose from "mongoose";
import OpenAI from "openai";
import User from "./models/User.js";
import { env, policyConfig } from "./shared/config/env.js";
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

  const hasGemini = !!env.GEMINI_API_KEY;
  const hasOpenAI = !!env.OPENAI_API_KEY;
  const useOllama = String(env.USE_OLLAMA || "true").toLowerCase() !== "false";
  const ollamaBaseUrl = env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const ollamaModel = env.OLLAMA_MODEL || "llama3.2:3b";

  if (useOllama) {
    try {
      const ping = await fetch(`${ollamaBaseUrl}/api/tags`);
      if (ping.ok) {
        logInfo(`Ollama reachable at ${ollamaBaseUrl}; model target ${ollamaModel}`);
      } else {
        logInfo(`Ollama check returned status ${ping.status}; cloud/fallback will be used when needed`);
      }
    } catch {
      logInfo("Ollama not reachable yet; cloud/fallback will be used when needed");
    }
  }

  if (hasGemini || hasOpenAI) {
    if (hasGemini) {
      const gemini = new OpenAI({
        apiKey: env.GEMINI_API_KEY,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      });
      if (gemini) logInfo("Gemini client initialized (primary)");
    }
    if (hasOpenAI) {
      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      if (openai) logInfo("OpenAI client initialized (backup)");
    }
  } else {
    logInfo("No AI key set; using heuristic chat mode");
  }

  const demoExists = await User.findOne({ email: env.DEMO_EMAIL });
  if (!demoExists) {
    logInfo("Demo user not found yet. It will be created by seed.");
  }
}

