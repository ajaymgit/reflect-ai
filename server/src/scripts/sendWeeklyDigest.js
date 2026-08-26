// Emails a weekly recap (entries written, current streak, dominant mood,
// health averages) to every account that has opted into
// weeklyDigestEnabled (see PATCH /api/auth/digest-preferences, off by
// default -- unlike the daily reminder script, nobody gets signed up for
// this without explicitly turning it on in Settings). Uses the same
// Resend-backed sendEmail util as forgot-password and the daily reminder
// script, including its "log instead of send" fallback when
// RESEND_API_KEY isn't configured, so this is safe to run in local dev
// without ever actually emailing anyone.
//
// Cadence is controlled entirely by whatever schedules this script, not by
// the script itself (unlike sendJournalingReminders.js, which self-filters
// by the current hour because it's meant to run every hour) -- this is
// meant to run once a week, e.g. Monday morning. Run manually
// (`npm run send-weekly-digest` from server/), or add a weekly cron entry:
//   0 8 * * 1 cd /path/to/reflect-ai/server && /usr/bin/env node src/scripts/sendWeeklyDigest.js >> /tmp/reflectai-digest.log 2>&1
//
// Skips anyone with no journal entries at all in the past 7 days AND no
// health data either -- an empty digest ("You wrote 0 entries this week")
// is a worse experience than no email that week.
import mongoose from "mongoose";
import HealthData from "../models/HealthData.js";
import JournalEntry from "../models/JournalEntry.js";
import User from "../models/User.js";
import { env } from "../shared/config/env.js";
import { sendEmail } from "../shared/utils/mailer.js";
import { getStreakDays } from "../shared/utils/streak.js";

const MOOD_LABEL = {
  happy: "happy",
  calm: "calm",
  reflective: "reflective",
  sad: "sad",
  stressed: "stressed",
  angry: "frustrated",
};

function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dominantMood(entries) {
  if (!entries.length) return null;
  const counts = new Map();
  for (const e of entries) counts.set(e.mood, (counts.get(e.mood) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function buildDigestEmail({ name, entryCount, streak, mood, avgSleep, avgSteps, avgStress }) {
  const subject =
    entryCount > 0
      ? `Your week in review: ${entryCount} ${entryCount === 1 ? "entry" : "entries"}`
      : "Your week in review";

  const lines = [];
  lines.push(
    entryCount > 0
      ? `You wrote ${entryCount} journal ${entryCount === 1 ? "entry" : "entries"} this week.`
      : "You didn't write any journal entries this week -- no pressure, just noting it.",
  );
  if (streak > 0) {
    lines.push(`You're currently on a ${streak}-day journaling streak.`);
  }
  if (mood) {
    lines.push(`Your most common mood this week was ${MOOD_LABEL[mood] || mood}.`);
  }
  const healthBits = [];
  if (avgSleep != null) healthBits.push(`averaged ${avgSleep.toFixed(1)}h of sleep`);
  if (avgSteps != null) healthBits.push(`averaged ${Math.round(avgSteps).toLocaleString()} steps/day`);
  if (avgStress != null) healthBits.push(`averaged a stress score of ${Math.round(avgStress)}`);
  if (healthBits.length) {
    lines.push(`On the health side, you ${healthBits.join(", ")}.`);
  }
  lines.push("Open ReflectAI to see the full picture, or just keep writing.");

  const text = `Hi ${name},\n\n${lines.join(" ")}\n\n- ReflectAI`;
  const html = `<p>Hi ${name},</p><p>${lines.join(" ")}</p><p>- ReflectAI</p>`;
  return { subject, text, html };
}

async function run() {
  await mongoose.connect(env.MONGO_URI);

  const users = await User.find({ weeklyDigestEnabled: true }).select("_id name email");
  console.log(`${users.length} user(s) opted into the weekly digest.`);

  const windowStart = sevenDaysAgo();
  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    const [weekEntries, streakEntries, weekHealth] = await Promise.all([
      // revealAt guard inlined (not journal/routes.js's visibleFilter, which
      // isn't exported from that module) -- excludes time-capsule entries
      // whose reveal date hasn't arrived yet, same as every other listing
      // query in the app.
      JournalEntry.find({
        userId: user._id,
        createdAt: { $gte: windowStart },
        revealAt: { $not: { $gt: new Date() } },
      }).select("mood createdAt"),
      // Same "cap at ~10 years of entries, not documents" fix as the
      // dashboard's streak query and the daily reminder script -- see the
      // matching comment in dashboard/routes.js.
      JournalEntry.find({ userId: user._id }).sort({ createdAt: -1 }).limit(3650).select("createdAt"),
      HealthData.find({ userId: user._id, date: { $gte: windowStart } }).select("sleepHours steps stressScore"),
    ]);

    if (weekEntries.length === 0 && weekHealth.length === 0) {
      skipped += 1;
      continue;
    }

    // Same tzOffsetMinutes limitation as the daily reminder script -- no
    // per-user timezone stored, so this uses getStreakDays' UTC default.
    const streak = getStreakDays(streakEntries);
    const mood = dominantMood(weekEntries);
    const avgSleep = average(weekHealth.map((h) => h.sleepHours).filter(Number.isFinite));
    const avgSteps = average(weekHealth.map((h) => h.steps).filter(Number.isFinite));
    const avgStress = average(weekHealth.map((h) => h.stressScore).filter(Number.isFinite));

    const { subject, text, html } = buildDigestEmail({
      name: user.name,
      entryCount: weekEntries.length,
      streak,
      mood,
      avgSleep,
      avgSteps,
      avgStress,
    });
    const result = await sendEmail({ to: user.email, subject, text, html });
    console.log(`${user.email}: ${result.delivered ? "sent" : `logged (${result.reason})`}`);
    sent += 1;
  }

  console.log(`\nDone. ${sent} digest(s) processed, ${skipped} user(s) skipped (nothing to report this week).`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
