// Emails anyone whose sealed time capsule became readable today -- sealing
// one is a deliberate, opt-in act ("write a letter to a future version of
// yourself, hidden until this date"), but nothing in the app currently tells
// you the day actually arrives; you'd only find out by happening to open the
// Write page and noticing it moved from "Still sealed" to "Ready to open" in
// the sidebar. This closes that loop the same way the daily reminder and
// weekly digest close theirs, using the same Resend-backed sendEmail util
// (including its "log instead of send" fallback when RESEND_API_KEY isn't
// configured).
//
// Unlike the weekly digest (opt-in, since a recurring recap is an inbox
// commitment nobody should get without asking), this has no separate
// preference toggle: getting told your OWN sealed letter just opened is a
// direct consequence of an action you already took, not a new subscription --
// the same way a kitchen timer going off doesn't need its own opt-in beyond
// setting the timer.
//
// Meant to run once a day (any time after midnight in whatever timezone the
// server itself is in -- see the tzOffsetMinutes limitation below), e.g.:
//   0 9 * * * cd /path/to/reflect-ai/server && /usr/bin/env node src/scripts/sendCapsuleReadyNotifications.js >> /tmp/reflectai-capsules.log 2>&1
// Run manually via `npm run send-capsule-notifications` from server/.
//
// Fires once per capsule: matched by revealAt falling on TODAY's calendar
// day (not "revealAt <= now"), so a capsule that opened yesterday and wasn't
// caught by a missed run doesn't get silently skipped forever, but also
// doesn't re-notify every day after it opens -- once its reveal day has
// passed, it simply stops matching this query on subsequent runs.
import mongoose from "mongoose";
import JournalEntry from "../models/JournalEntry.js";
import User from "../models/User.js";
import { env } from "../shared/config/env.js";
import { sendEmail } from "../shared/utils/mailer.js";

function todayRange() {
  // Same no-per-user-timezone limitation as sendJournalingReminders.js and
  // sendWeeklyDigest.js -- there's no stored IANA timezone per account, so
  // "today" here is the server process's own local calendar day.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function buildCapsuleEmail({ name, entries }) {
  const count = entries.length;
  const subject = count === 1 ? "A time capsule just opened" : `${count} time capsules just opened`;

  const lines = entries.map((e) => {
    const label = e.title || "A sealed entry";
    return `"${label}" (written ${new Date(e.createdAt).toLocaleDateString()})`;
  });

  const intro =
    count === 1
      ? `The letter you sealed to yourself -- ${lines[0]} -- just became readable.`
      : `${count} letters you sealed to yourself just became readable: ${lines.join(", ")}.`;

  const text = `Hi ${name},\n\n${intro} Open ReflectAI's Write page to read it.\n\n- ReflectAI`;
  const html = `<p>Hi ${name},</p><p>${intro} Open ReflectAI's Write page to read it.</p><p>- ReflectAI</p>`;
  return { subject, text, html };
}

async function run() {
  await mongoose.connect(env.MONGO_URI);

  const { start, end } = todayRange();
  // No visibleJournalFilter guard needed here -- that guard EXCLUDES entries
  // whose revealAt hasn't arrived; this query is the deliberate opposite,
  // looking specifically for entries whose revealAt falls exactly today.
  const readyToday = await JournalEntry.find({
    revealAt: { $gte: start, $lt: end },
  }).select("userId title createdAt");

  if (readyToday.length === 0) {
    console.log("No time capsules opened today.");
    await mongoose.disconnect();
    return;
  }

  const byUser = new Map();
  for (const entry of readyToday) {
    const key = String(entry.userId);
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(entry);
  }

  console.log(`${readyToday.length} capsule(s) opened today across ${byUser.size} user(s).`);

  let sent = 0;
  for (const [userId, entries] of byUser) {
    const user = await User.findById(userId).select("name email");
    if (!user) continue;
    const { subject, text, html } = buildCapsuleEmail({ name: user.name, entries });
    const result = await sendEmail({ to: user.email, subject, text, html });
    console.log(`${user.email}: ${result.delivered ? "sent" : `logged (${result.reason})`}`);
    sent += 1;
  }

  console.log(`\nDone. ${sent} notification(s) processed.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
