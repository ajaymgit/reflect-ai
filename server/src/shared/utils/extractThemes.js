// Lightweight, deterministic keyword extraction for a single journal entry.
// No AI call involved (matches the same "no new dependency, no new failure
// mode" approach as the rest of this codebase's existing keyword-frequency
// logic in chat/service.js's detectThemes, which this deliberately does not
// touch or import from -- kept fully independent so this addition can't
// regress the already-verified chat pipeline).
//
// This produces plain extracted keywords, not the polished, hand-authored
// concept labels used in seed.js's demo data (e.g. "self_trust",
// "people_pleasing") -- that quality bar would require an LLM call per
// journal entry, which is a materially different (costlier, less reliable)
// feature than "the field that's supposed to hold themes is always empty."
// This is the low-risk fix: real, non-empty, deterministic output instead of
// permanently empty, without taking on an AI dependency for it.

const STOPWORDS = new Set([
  "the", "a", "an", "and", "to", "i", "of", "in", "it", "is", "felt", "feel",
  "feeling", "noticed", "today", "day", "after", "before", "with", "that",
  "this", "about", "finally", "much", "just", "when", "then", "than", "have",
  "has", "had", "been", "were", "was", "are", "your", "their", "them", "from",
  "which", "would", "could", "should", "really", "very", "some", "more",
  "most", "also", "even", "still", "because", "while", "where", "what",
  "there", "here", "into", "over", "again", "back", "will", "for", "but",
  "not", "you", "she", "him", "her", "his", "they", "them", "we", "us", "my",
  "me", "so", "on", "at", "as", "if", "or", "be", "was", "am",
]);

/**
 * Extracts up to `limit` distinct, meaningful keywords from a single
 * journal entry's text. Returns [] for entries too short to have any real
 * signal (avoids tagging a one-line entry with junk).
 */
export function extractThemes(content, limit = 3) {
  const text = String(content || "").toLowerCase();
  const words = text.split(/[^a-z]+/).filter(Boolean);
  if (words.length < 5) return [];

  const counts = {};
  for (const w of words) {
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    counts[w] = (counts[w] || 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}
