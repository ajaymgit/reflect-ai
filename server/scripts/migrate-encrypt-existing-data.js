// One-time migration: re-saves every existing JournalEntry and HealthData
// document so their sensitive fields (content/title/tags/themes,
// sleepHours/steps/stressScore/restingHeartRate) get encrypted at rest.
//
// Not required for the app to keep working -- decryptField() already treats
// any value without the "v1:" prefix as legacy plaintext and returns it
// unchanged (see shared/utils/encryption.js) -- but until a row is
// re-saved, it sits in the database as plaintext. Run this once after
// deploying encryption-at-rest to bring existing rows fully up to date:
//
//   node scripts/migrate-encrypt-existing-data.js
//
// Safe to run multiple times: re-encrypting an already-encrypted field is a
// no-op from the app's perspective (it just gets a new IV/ciphertext for the
// same plaintext), and any document whose fields are already encrypted
// simply gets its ciphertext refreshed, not double-encrypted (Mongoose's
// getter decrypts back to plaintext before the setter re-encrypts it on
// the next .save()).

import mongoose from "mongoose";
import JournalEntry from "../src/models/JournalEntry.js";
import HealthData from "../src/models/HealthData.js";
import { env } from "../src/shared/config/env.js";

async function migrate() {
  await mongoose.connect(env.MONGO_URI);
  console.log(`Connected to ${env.MONGO_URI}`);

  const journalCursor = JournalEntry.find({}).cursor();
  let journalCount = 0;
  for await (const doc of journalCursor) {
    // Re-triggering the setters: read the current (already-decrypted-by-getter)
    // value and write it straight back. markModified forces Mongoose to
    // re-run the setter and persist a change even if the JS-level value
    // looks identical to what was already there.
    doc.content = doc.content;
    doc.title = doc.title;
    doc.tags = doc.tags;
    doc.themes = doc.themes;
    doc.markModified("content");
    doc.markModified("title");
    doc.markModified("tags");
    doc.markModified("themes");
    await doc.save();
    journalCount += 1;
  }
  console.log(`Re-encrypted ${journalCount} journal entries.`);

  const healthCursor = HealthData.find({}).cursor();
  let healthCount = 0;
  for await (const doc of healthCursor) {
    doc.sleepHours = doc.sleepHours;
    doc.steps = doc.steps;
    doc.stressScore = doc.stressScore;
    doc.restingHeartRate = doc.restingHeartRate;
    doc.markModified("sleepHours");
    doc.markModified("steps");
    doc.markModified("stressScore");
    doc.markModified("restingHeartRate");
    await doc.save();
    healthCount += 1;
  }
  console.log(`Re-encrypted ${healthCount} health data rows.`);

  await mongoose.disconnect();
  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
