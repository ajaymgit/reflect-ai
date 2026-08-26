// Emails a gentle journaling reminder to any user who hasn't logged a
// journal entry yet today, using the same Resend-backed sendEmail util that
// forgot-password already relies on -- including its "log instead of send"
// fallback when RESEND_API_KEY isn't configured, so this is safe to run in
// local dev without ever actually emailing anyone.
//
// Each user picks their own reminder hour in Settings (reminderHour, 0-23,
// see PATCH /api/auth/reminder-preferences) or can turn reminders off
// entirely (reminderEnabled). Because of that, this script is meant to run
// once every hour, not once a day -- each run only emails users whose
// reminderHour matches the current local hour. Not wired to run
// automatically -- this project has no in-process scheduler. Run manually
// (`npm run send-reminders` from server/), or add an hourly cron entry, e.g.:
//   0 * * * * cd /path/to/reflect-ai/server && /usr/bin/env node src/scripts/sendJournalingReminders.js >> /tmp/reflectai-reminders.log 2>&1
// Pass --force to ignore the hour check and send to every eligible user
// regardless of their chosen hour -- useful for manually testing the script.
//
// Skips accounts created today (no reminder minutes after signing up),
// anyone with reminders disabled, and anyone who already has an entry today.
import mongoose from "mongoose";
import JournalEntry from "../models/JournalEntry.js";
import User from "../models/User.js";
import { env } from "../shared/config/env.js";
import { sendEmail } from "../shared/utils/mailer.js";
import { getStreakDays } from "../shared/utils/streak.js";

const force = process.argv.includes("--force");

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildReminderEmail({ name, streak }) {
  const subject = streak > 0 ? `Keep your ${streak}-day streak going` : "A quiet moment to reflect?";
  const streakLine =
    streak > 0
      ? `You're on a ${streak}-day journaling streak -- one line tonight keeps it alive.`
      : "No pressure, even a single sentence counts.";
  const text = `Hi ${name},\n\nJust a gentle nudge -- you haven't journaled yet today. ${streakLine}\n\n- ReflectAI`;
  const html = `<p>Hi ${name},</p><p>Just a gentle nudge — you haven't journaled yet today. ${streakLine}</p><p>- ReflectAI</p>`;
  return { subject, text, html };
}

async function run() {
  await mongoose.connect(env.MONGO_URI);

  const todayStart = startOfToday();
  const currentHour = new Date().getHours();
  const query = { createdAt: { $lt: todayStart }, reminderEnabled: true };
  if (!force) query.reminderHour = currentHour;
  const users = await User.find(query).select("_id name email");

  console.log(
    `Hour ${currentHour}${force ? " (--force: hour ignored)" : ""} -- ${users.length} user(s) with a matching, enabled reminder preference.`,
  );

  let reminded = 0;
  let skipped = 0;

  for (const user of users) {
    const [hasToday, recentEntries] = await Promise.all([
      JournalEntry.exists({ userId: user._id, createdAt: { $gte: todayStart } }),
      // See the matching comment in dashboard/routes.js -- capping at 60
      // *documents* (rather than a generous span of calendar time) silently
      // truncates the streak for anyone journaling more than once a day.
      // Already select()-ed down to just createdAt, so a much higher limit
      // (~10 years of entries) is still a cheap query.
      JournalEntry.find({ userId: user._id }).sort({ createdAt: -1 }).limit(3650).select("createdAt"),
    ]);
    if (hasToday) {
      skipped += 1;
      continue;
    }

    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    const streak = getStreakDays(recentEntries, { asOf: yesterday });

    const { subject, text, html } = buildReminderEmail({ name: user.name, streak });
    const result = await sendEmail({ to: user.email, subject, text, html });
    console.log(`${user.email}: ${result.delivered ? "sent" : `logged (${result.reason})`}`);
    reminded += 1;
  }

  console.log(`\nDone. ${reminded} reminder(s) processed, ${skipped} user(s) already journaled today.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
