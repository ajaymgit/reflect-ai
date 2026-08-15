// Thin wrapper around fetch that aborts after `timeoutMs`. Used for every
// local Ollama call (chat, retrospect analysis, embeddings) -- none of those
// fetches previously had any timeout at all, so a genuinely stuck Ollama
// (out of memory and swapping, a wedged model load, etc, as opposed to
// cleanly refusing the connection) would hang that request indefinitely
// instead of failing over to the heuristic/keyword-matching fallback each
// caller already has. A plain helper (not a class/service) since the only
// thing every caller needs is "the same fetch, but bounded."
export async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
