// One-off/rerunnable script: recomputes `themes` for every JournalEntry
// using the current extractThemes() logic and overwrites the stored value.
//
// Needed after any change to extractThemes.js's STOPWORDS or algorithm --
// `themes` is computed once at write time (see journal/routes.js) and never
// touched again, so entries created before a wordlist fix keep serving the
// old, wrong output forever otherwise. Retrospect's recurringThemes and Year
// in Review's topThemes both just aggregate this stored field directly, so
// a stale value here shows up directly in the UI.
//
// Run from server/: node src/scripts/recomputeThemes.js
import mongoose from "mongoose";
import JournalEntry from "../models/JournalEntry.js";
import { env } from "../shared/config/env.js";
import { extractThemes } from "../shared/utils/extractThemes.js";

async function run() {
  await mongoose.connect(env.MONGO_URI);

  const entries = await JournalEntry.find({});
  console.log(`Recomputing themes for ${entries.length} journal entr${entries.length === 1 ? "y" : "ies"}...`);

  let changed = 0;
  for (const entry of entries) {
    const next = extractThemes(entry.content);
    const prev = Array.isArray(entry.themes) ? entry.themes : [];
    const same = prev.length === next.length && prev.every((t, i) => t === next[i]);
    if (!same) {
      entry.themes = next;
      await entry.save();
      changed += 1;
    }
  }

  console.log(`Done. ${changed} of ${entries.length} entries updated.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
