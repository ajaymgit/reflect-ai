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
    createdAt: new Date(now - (emotionalSeedEntries.length - 1 - i) * 24 * 60 * 60 * 1000),
    updatedAt: new Date(now - (emotionalSeedEntries.length - 1 - i) * 24 * 60 * 60 * 1000),
  }));
  const insertedJournals = await JournalEntry.insertMany(journals);

  const seededSleepHours = [
    5.1, 6.8, 7.9, 4.9, 8.2, 6.1, 7.4,
    5.6, 8.0, 6.3, 7.7, 5.2, 8.4, 6.0,
    7.2, 5.8, 8.1, 6.4, 7.6, 5.4, 8.3,
  ];
  const health = Array.from({ length: 21 }).map((_, i) => ({
    userId: demo._id,
    date: new Date(now - (21 - i - 1) * 24 * 60 * 60 * 1000),
    sleepHours: seededSleepHours[i],
    steps: 3600 + i * 320 + (i % 3) * 210,
    stressScore: Math.max(36, 78 - i * 1.6 + (i % 4) * 2),
    restingHeartRate: 67 + (i % 4),
    completeness: i % 6 === 0 ? 0.74 : 0.88,
    confidence: i % 7 === 0 ? 0.72 : 0.9,
    source: "seed",
  }));
  await HealthData.insertMany(health);

  await RetrospectAnalysis.insertMany([
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
        aiResponse:
          "I hear you. Feeling tired even after sleep can feel frustrating.\n\nLooking at your recent notes, does the energy drop feel stronger on work-heavy days or socially heavy days?",
        evidence: insertedJournals
          .slice(34, 36)
          .map((j) => ({ journalId: j._id.toString(), quote: j.content, date: j.createdAt })),
        confidence: 0.74,
        fallback: false,
        reasoning: "Seeded reflective response for realistic chat history.",
        focus: "energy",
        createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
      },
      {
        userMessage: "Mostly after meetings. I feel mentally drained.",
        aiResponse:
          "That pattern makes sense. Mentally dense conversations can drain more than physical effort.\n\nWhat usually happens in the 30 minutes right after those meetings?",
        evidence: insertedJournals
          .slice(35, 37)
          .map((j) => ({ journalId: j._id.toString(), quote: j.content, date: j.createdAt })),
        confidence: 0.79,
        fallback: false,
        reasoning: "Follow-up turn with contextual continuity.",
        focus: "workload",
        createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000),
      },
      {
        userMessage: "I scroll a lot and delay breaks.",
        aiResponse:
          "Thanks for noticing that honestly. That small loop can quietly increase fatigue over the day.\n\nWould you like to test one tiny reset routine after your next meeting?",
        evidence: insertedJournals
          .slice(37, 39)
          .map((j) => ({ journalId: j._id.toString(), quote: j.content, date: j.createdAt })),
        confidence: 0.81,
        fallback: false,
        reasoning: "Habit-loop reflective turn.",
        focus: "motivation",
        createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000 + 42 * 60 * 1000),
      },
      {
        userMessage: "I feel happy today because I passed my lab exam.",
        aiResponse:
          "That is a big win, and you earned it.\n\nWhat do you think helped you perform well this time that you can reuse next time too?",
        evidence: insertedJournals
          .slice(0, 2)
          .map((j) => ({ journalId: j._id.toString(), quote: j.content, date: j.createdAt })),
        confidence: 0.82,
        fallback: false,
        reasoning: "Positive-state continuity example for demo.",
        focus: "positive_state",
        createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000),
      },
      {
        userMessage: "Can we talk about relationships now?",
        aiResponse:
          "Of course. I can feel this matters to you.\n\nWhat part of your relationships feels easiest right now, and what feels heaviest?",
        evidence: insertedJournals
          .slice(18, 21)
          .map((j) => ({ journalId: j._id.toString(), quote: j.content, date: j.createdAt })),
        confidence: 0.77,
        fallback: false,
        reasoning: "Topic-switch sample turn for screenshots.",
        focus: "relationships",
        createdAt: new Date(now - 10 * 60 * 1000),
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

