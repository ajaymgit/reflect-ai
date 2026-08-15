// One-off/rerunnable script: computes and saves an embedding (see
// shared/services/embeddings.js) for every JournalEntry that doesn't
// already have one -- covers entries created before semantic search
// existed, entries from seed.js, and any entry whose embedding call failed
// at creation time (e.g. Ollama was briefly down).
//
// Run from server/: npm run embed-journals
// Requires the embedding model to actually be pulled first:
//   ollama pull nomic-embed-text
// (or whatever OLLAMA_EMBED_MODEL is set to in .env)
//
// Add --force to recompute EVERY entry's embedding, not just entries
// missing one -- needed after any change to how embeddings are computed
// (e.g. the taskType prefix embeddings.js adds for nomic-embed-text), since
// old and new embeddings from a changed scheme aren't reliably comparable
// against each other.
import mongoose from "mongoose";
import JournalEntry from "../models/JournalEntry.js";
import { env } from "../shared/config/env.js";
import { embedJournalEntry } from "../shared/services/embeddings.js";

const force = process.argv.includes("--force");

async function run() {
  await mongoose.connect(env.MONGO_URI);

  const entries = await JournalEntry.find(force ? {} : { embedding: { $exists: false } });
  console.log(`${entries.length} journal entr${entries.length === 1 ? "y" : "ies"} missing an embedding.`);

  let done = 0;
  let failed = 0;
  for (const entry of entries) {
    const ok = await embedJournalEntry(entry);
    if (ok) {
      done += 1;
    } else {
      failed += 1;
    }
  }

  console.log(`\nDone. ${done} embedded, ${failed} failed (Ollama unreachable or embedding model not pulled).`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
