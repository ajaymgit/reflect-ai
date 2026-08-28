import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import AuditLog from "./models/AuditLog.js";
import ChatSession from "./models/ChatSession.js";
import HealthData from "./models/HealthData.js";
import JournalEntry from "./models/JournalEntry.js";
import RetrospectAnalysis from "./models/RetrospectAnalysis.js";
import User from "./models/User.js";
import { env } from "./shared/config/env.js";

const emotionalSeedEntries = [
  { mood: "happy", content: "I felt genuinely proud after finishing a small goal and sharing it with a friend.", themes: ["progress", "connection", "confidence"] },
  { mood: "happy", content: "I laughed a lot today during lunch and felt present in the moment.", themes: ["joy", "social", "presence"] },
  { mood: "happy", content: "I noticed more optimism this morning and started the day with clear energy.", themes: ["optimism", "morning", "energy"] },
  { mood: "happy", content: "A simple walk in sunlight made me feel grateful and mentally lighter.", themes: ["gratitude", "nature", "lightness"] },
  { mood: "happy", content: "I handled a tricky situation calmly and felt proud of my growth.", themes: ["growth", "resilience", "self-trust"] },
  { mood: "happy", content: "I enjoyed deep focus while working on a creative idea.", themes: ["creativity", "focus", "meaning"] },
  { mood: "calm", content: "I kept a slow routine today and felt steady without rushing.", themes: ["routine", "steadiness", "calm"] },
  { mood: "calm", content: "Breathing exercises helped me reset after a noisy afternoon.", themes: ["breathing", "reset", "calm"] },
  { mood: "calm", content: "I disconnected from notifications for an hour and felt clear.", themes: ["boundaries", "clarity", "digital-balance"] },
  { mood: "calm", content: "I slept well and woke up with a quieter mind than usual.", themes: ["sleep_quality", "mental_quiet", "recovery"] },
  { mood: "calm", content: "A short conversation with family made me feel grounded.", themes: ["family", "grounding", "support"] },
  { mood: "calm", content: "I ended the day with journaling and felt emotionally balanced.", themes: ["journaling", "balance", "reflection"] },
  { mood: "reflective", content: "I keep thinking about what kind of life pace I actually want.", themes: ["identity", "values", "future"] },
  { mood: "reflective", content: "I noticed I perform better when I start with one meaningful task.", themes: ["habits", "focus", "meaningful_work"] },
  { mood: "reflective", content: "I am questioning whether I say yes too quickly to requests.", themes: ["boundaries", "people_pleasing", "self_respect"] },
  { mood: "reflective", content: "I wonder if my stress is more about uncertainty than workload.", themes: ["uncertainty", "stress_source", "awareness"] },
  { mood: "reflective", content: "I want my next month to be less reactive and more intentional.", themes: ["intentionality", "planning", "control"] },
  { mood: "reflective", content: "I noticed my confidence grows when I keep promises to myself.", themes: ["self_trust", "consistency", "confidence"] },
  { mood: "sad", content: "I felt lonely tonight even though I was surrounded by people.", themes: ["loneliness", "belonging", "emotional_gap"] },
  { mood: "sad", content: "I kept replaying a difficult conversation and felt heavy.", themes: ["rumination", "conflict", "emotional_weight"] },
  { mood: "sad", content: "I felt disappointed in myself for avoiding something important.", themes: ["avoidance", "self_criticism", "disappointment"] },
  { mood: "sad", content: "My motivation dropped and everything felt harder than usual.", themes: ["low_motivation", "effort", "mood_drop"] },
  { mood: "sad", content: "I missed someone today and felt an ache I could not explain.", themes: ["grief", "missing", "attachment"] },
  { mood: "sad", content: "I felt emotionally flat and disconnected from things I usually enjoy.", themes: ["numbness", "disconnection", "anhedonia"] },
  { mood: "stressed", content: "Back-to-back meetings drained me before noon and I felt tense.", themes: ["meetings", "workload", "tension"] },
  { mood: "stressed", content: "I slept enough but still felt exhausted after mentally heavy tasks.", themes: ["sleep_mismatch", "cognitive_load", "fatigue"] },
  { mood: "stressed", content: "I felt pressured by deadlines and skipped breaks again.", themes: ["deadlines", "pressure", "breaks"] },
  { mood: "stressed", content: "I carried stress home and had trouble winding down at night.", themes: ["carryover_stress", "evening", "recovery"] },
  { mood: "stressed", content: "I kept switching tasks and felt scattered all day.", themes: ["context_switching", "focus_fragmentation", "overload"] },
  { mood: "stressed", content: "Today I felt drained after meetings but calmer after a walk.", themes: ["meetings", "drained", "recovery_walk"] },
];

async function seed() {
  await mongoose.connect(env.MONGO_URI);

  await Promise.all([
    AuditLog.deleteMany({}),
    ChatSession.deleteMany({}),
    JournalEntry.deleteMany({}),
    HealthData.deleteMany({}),
    RetrospectAnalysis.deleteMany({}),
    User.deleteMany({ email: env.DEMO_EMAIL }),
  ]);

  const passwordHash = await bcrypt.hash(env.DEMO_PASSWORD, 10);
  const demo = await User.create({
    name: "Demo User",
    email: env.DEMO_EMAIL,
    passwordHash,
  });

  const now = Date.now();
  const journals = emotionalSeedEntries.map((entry, i) => ({
    userId: demo._id,
    content: `Day ${i + 1}: ${entry.content}`,
    mood: entry.mood,
    themes: entry.themes,
    createdAt: new Date(now - (emotionalSeedEntries.length - i) * 24 * 60 * 60 * 1000),
    updatedAt: new Date(now - (emotionalSeedEntries.length - i) * 24 * 60 * 60 * 1000),
  }));

  // Two time capsules -- one already past its revealAt (so the demo account
  // has a real "arrived" state to show on Dashboard/Journal without waiting
  // days for one to actually open) and one still waiting (so the "on its
  // way" nudge has something to render too). Dates computed off `now`
  // rather than hardcoded so this seed stays correct no matter when it's
  // actually run.
  const capsuleJournals = [
    {
      userId: demo._id,
      title: "For the version of me reading this",
      content:
        "I don't know exactly what's changed by the time you read this, but I hope work feels lighter and you're sleeping better. Be proud of how far you've come.",
      mood: "reflective",
      tags: ["future-self", "hope"],
      themes: ["identity", "future", "hope"],
      isKeepsake: true,
      createdAt: new Date(now - 40 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 40 * 24 * 60 * 60 * 1000),
      revealAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
    },
    {
      userId: demo._id,
      title: "A note for later",
      content:
        "Sealing this one for a couple of months from now. Curious whether the thing I'm worried about right now even matters by the time you open it.",
      mood: "calm",
      tags: ["future-self", "check-in"],
      themes: ["patience", "growth", "check-in"],
      createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
      revealAt: new Date(now + 60 * 24 * 60 * 60 * 1000),
    },
  ];

  // .create() with an array (not .insertMany()) -- insertMany's handling of
  // custom setters isn't reliably documented across Mongoose versions, and
  // content/tags/themes now depend on their setters running to get
  // encrypted before hitting the DB (see models/JournalEntry.js). .create()
  // is unambiguous: it constructs a real document (running every setter)
  // per entry.
  await JournalEntry.create([...journals, ...capsuleJournals]);

  const health = Array.from({ length: 14 }).map((_, i) => ({
    userId: demo._id,
    date: new Date(now - (14 - i) * 24 * 60 * 60 * 1000),
    sleepHours: i % 2 === 0 ? 7.5 : 8.0,
    steps: 4200 + i * 250,
    stressScore: 75 - i * 2,
    restingHeartRate: 69 + (i % 3),
    completeness: 0.84,
    confidence: 0.86,
    source: "seed",
  }));
  // Same reasoning as JournalEntry.create() above -- these fields are now
  // encrypted via setters that only .create() is guaranteed to run.
  await HealthData.create(health);

  // .create() (not .insertMany()) -- same reasoning as JournalEntry/HealthData
  // above: summary/detectedPatterns/socraticQuestion are now encrypted via
  // setters that only .create() is guaranteed to run.
  await RetrospectAnalysis.create([
    {
      userId: demo._id,
      summary: "Recurring fatigue appears linked to weekday stress and cognitive overload.",
      detectedPatterns: ["weekday stress pattern", "sleep-fatigue mismatch"],
      socraticQuestion: "What happens in your evenings before the days you feel most drained?",
      confidence: 0.83,
    },
    {
      userId: demo._id,
      summary: "Weekend recovery suggests context-driven exhaustion rather than sleep duration alone.",
      detectedPatterns: ["weekend rebound", "workload-triggered tension"],
      socraticQuestion: "What boundaries seem to protect your energy on weekends?",
      confidence: 0.79,
    },
  ]);

  await ChatSession.create({
    userId: demo._id,
    turns: [
      {
        userMessage: "I feel tired even after sleeping enough.",
        aiResponse: "When during the week do you notice the biggest drop in energy?",
        evidence: [],
        confidence: 0.62,
        fallback: true,
        reasoning: "Bootstrapped starter turn.",
        focus: "energy",
        createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  console.log("Seed complete:");
  console.log(`Email: ${env.DEMO_EMAIL}`);
  console.log(`Password: ${env.DEMO_PASSWORD}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

