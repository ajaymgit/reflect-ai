import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

// visibleJournalFilter is the single guard the "even the sender can't peek
// early" time-capsule promise depends on across every route that reads a
// user's journal entries (dashboard, health, retrospect, year-in-review,
// chat, export, journal itself). It was previously duplicated ad hoc in
// multiple files and, being duplicated, quietly missing from several of
// them -- a real bug fixed earlier in this project's history. This suite
// runs it against a genuine Mongo query (via mongodb-memory-server, same
// pattern as chat/service.test.js) rather than just inspecting the returned
// object's shape, so it actually proves the guard excludes what it claims to
// exclude at the database level, not just that the JS object looks right.
let JournalEntry;
let visibleJournalFilter;
let mongod;
let userId;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGO_URI);

  JournalEntry = (await import("../../models/JournalEntry.js")).default;
  visibleJournalFilter = (await import("./visibleJournal.js")).visibleJournalFilter;
  userId = new mongoose.Types.ObjectId();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe("visibleJournalFilter", () => {
  it("excludes a capsule whose reveal date is still in the future, but includes everything else", async () => {
    const now = Date.now();
    const normal = await JournalEntry.create({
      userId,
      content: "A normal entry, never sealed.",
      mood: "calm",
    });
    const revealedCapsule = await JournalEntry.create({
      userId,
      content: "A capsule whose reveal date already passed.",
      mood: "reflective",
      revealAt: new Date(now - 24 * 60 * 60 * 1000), // yesterday
    });
    const sealedCapsule = await JournalEntry.create({
      userId,
      content: "Still sealed -- must not appear.",
      mood: "sad",
      revealAt: new Date(now + 24 * 60 * 60 * 1000), // tomorrow
    });

    const results = await JournalEntry.find(visibleJournalFilter({ userId }));
    const ids = results.map((e) => String(e._id)).sort();

    expect(ids).toEqual([String(normal._id), String(revealedCapsule._id)].sort());
    expect(ids).not.toContain(String(sealedCapsule._id));
  });

  it("composes with additional query fields (e.g. a mood filter) without losing the capsule guard", async () => {
    await JournalEntry.deleteMany({ userId });
    const happyVisible = await JournalEntry.create({ userId, content: "Happy and visible.", mood: "happy" });
    await JournalEntry.create({ userId, content: "Calm and visible.", mood: "calm" });
    await JournalEntry.create({
      userId,
      content: "Happy but still sealed.",
      mood: "happy",
      revealAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const results = await JournalEntry.find(visibleJournalFilter({ userId, mood: "happy" }));
    expect(results).toHaveLength(1);
    expect(String(results[0]._id)).toBe(String(happyVisible._id));
  });

  it("returns a filter whose own revealAt clause always wins over any conflicting key in `extra`", () => {
    // Documents real, deliberate behavior: `extra` is spread first, so a
    // caller can never accidentally (or intentionally) smuggle in their own
    // revealAt override that bypasses the guard -- this function's own
    // revealAt clause is always applied last.
    const filter = visibleJournalFilter({ userId, revealAt: "anything" });
    expect(filter.revealAt).not.toBe("anything");
    expect(filter.revealAt).toEqual({ $not: { $gt: expect.any(Date) } });
  });
});
