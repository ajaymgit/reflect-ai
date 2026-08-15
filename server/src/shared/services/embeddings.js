import { env } from "../config/env.js";
import { fetchWithTimeout } from "../utils/fetchWithTimeout.js";
import { logError, logInfo } from "../utils/logger.js";

// Separate from chat/service.js's Ollama config (see the duplication-
// rationale comment in retrospect/service.js) but reuses the same
// OLLAMA_BASE_URL/USE_OLLAMA toggle -- embeddings are still an Ollama call,
// just a different model and endpoint. OLLAMA_EMBED_MODEL defaults to
// "nomic-embed-text", a small (~274MB) model built specifically for
// embeddings, not the chat model (llama3.2:3b) -- it must be pulled
// separately: `ollama pull nomic-embed-text`. Semantic search silently does
// nothing (falls back to keyword matching, see chat/service.js) until that
// model is actually pulled.
const useOllama = String(env.USE_OLLAMA || "true").toLowerCase() !== "false";
const ollamaBaseUrl = env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const embedModel = env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

let embedModelUnavailableLogged = false;

// nomic-embed-text (the default embedding model) was trained with, and
// expects, a task-specific prefix on its input -- "search_document: " for
// the text being indexed, "search_query: " for the text being searched
// with. Without these, cosine similarity scores between a query and its
// truly-best-matching document come out low and poorly separated from
// unrelated documents (this was tested directly: unprefixed queries against
// this project's own seed data returned every score below the match
// threshold, prefixed queries did not). rawPrefix lets a different
// OLLAMA_EMBED_MODEL that doesn't use this convention opt out.
function prefixFor(taskType) {
  if (!embedModel.includes("nomic-embed")) return "";
  return taskType === "query" ? "search_query: " : "search_document: ";
}

// Returns null (never throws) on any failure -- embedding is a best-effort
// enhancement layered on top of already-working keyword matching, not a
// dependency anything else should break over.
export async function embedText(text, { taskType = "document" } = {}) {
  if (!useOllama || !text || !String(text).trim()) return null;
  try {
    const response = await fetchWithTimeout(
      `${ollamaBaseUrl}/api/embeddings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: embedModel, prompt: `${prefixFor(taskType)}${String(text)}` }),
      },
      10000,
    );
    if (!response.ok) {
      // 404 here almost always means the embedding model was never pulled --
      // logged once (not per-call) so it doesn't spam the console on every
      // single chat message/journal save while still surfacing the fix.
      if (!embedModelUnavailableLogged) {
        logError("Ollama embedding request failed -- has the embedding model been pulled?", {
          embedModel,
          status: response.status,
          hint: `ollama pull ${embedModel}`,
        });
        embedModelUnavailableLogged = true;
      }
      return null;
    }
    const data = await response.json();
    const vector = data?.embedding;
    if (!Array.isArray(vector) || vector.length === 0) return null;
    return vector;
  } catch (error) {
    if (!embedModelUnavailableLogged) {
      logError("Ollama embedding request errored", { embedModel, error: error?.message || String(error) });
      embedModelUnavailableLogged = true;
    }
    return null;
  }
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Fire-and-forget from the journal creation route: computes and saves an
// entry's embedding without making the save request wait on it. Failure is
// swallowed (already logged inside embedText) -- a missing embedding just
// means that entry falls back to keyword matching until backfilled.
export async function embedJournalEntry(entry) {
  const vector = await embedText(entry.content, { taskType: "document" });
  if (!vector) return false;
  entry.embedding = vector;
  await entry.save();
  logInfo("Computed embedding for journal entry", { entryId: String(entry._id), dims: vector.length });
  return true;
}

// Ranks a user's journal entries by semantic (meaning-based) closeness to
// `queryText`, e.g. "what did I say about my thesis advisor" can match an
// entry that never uses those exact words. Only considers entries that
// already have an embedding (see embedJournalEntry / the backfill script) --
// callers should treat an empty result as "fall back to keyword matching",
// not "no relevant entries exist". Brute-force cosine similarity is
// intentional: fine for a single user's few hundred entries, and avoids
// needing a real vector index (Mongo Atlas Vector Search, a separate vector
// DB, etc.) that this project's local MongoDB doesn't have.
export async function findSemanticMatches(journals, queryText, { limit = 5, minScore = 0.5 } = {}) {
  const queryVector = await embedText(queryText, { taskType: "query" });
  if (!queryVector) return [];

  const scored = journals
    .filter((j) => Array.isArray(j.embedding) && j.embedding.length === queryVector.length)
    .map((j) => ({ journal: j, score: cosineSimilarity(j.embedding, queryVector) }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ journal, score }) => ({ journal, score }));
}
