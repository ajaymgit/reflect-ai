// One-off maintenance script: deletes every user account except the demo
// account (env.DEMO_EMAIL), along with all of that user's journal entries,
// health data, chat sessions, retrospect analyses, refresh sessions,
// password reset tokens, and audit log entries. The demo user and its data
// are left untouched.
//
// Run from server/: node src/scripts/flushNonDemoUsers.js
// Add --dry-run to see what would be deleted without deleting anything.
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";
import ChatSession from "../models/ChatSession.js";
import HealthData from "../models/HealthData.js";
import JournalEntry from "../models/JournalEntry.js";
import PasswordResetToken from "../models/PasswordResetToken.js";
import RefreshSession from "../models/RefreshSession.js";
import RetrospectAnalysis from "../models/RetrospectAnalysis.js";
import User from "../models/User.js";
import { env } from "../shared/config/env.js";

const isDryRun = process.argv.includes("--dry-run");

async function run() {
  await mongoose.connect(env.MONGO_URI);

  const usersToDelete = await User.find({ email: { $ne: env.DEMO_EMAIL } }).select("_id email");
  const userIds = usersToDelete.map((u) => u._id);

  console.log(`Demo account kept: ${env.DEMO_EMAIL}`);
  console.log(`${usersToDelete.length} other account(s) found:`);
  usersToDelete.forEach((u) => console.log(`  - ${u.email}`));

  if (userIds.length === 0) {
    console.log("Nothing to delete.");
    await mongoose.disconnect();
    return;
  }

  if (isDryRun) {
    console.log("\n--dry-run set -- no data was deleted.");
    await mongoose.disconnect();
    return;
  }

  const filter = { userId: { $in: userIds } };
  const [journals, health, chats, retros, refreshSessions, resetTokens, audits, users] = await Promise.all([
    JournalEntry.deleteMany(filter),
    HealthData.deleteMany(filter),
    ChatSession.deleteMany(filter),
    RetrospectAnalysis.deleteMany(filter),
    RefreshSession.deleteMany(filter),
    PasswordResetToken.deleteMany(filter),
    AuditLog.deleteMany(filter),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);

  console.log("\nDeleted:");
  console.log(`  users: ${users.deletedCount}`);
  console.log(`  journal entries: ${journals.deletedCount}`);
  console.log(`  health data: ${health.deletedCount}`);
  console.log(`  chat sessions: ${chats.deletedCount}`);
  console.log(`  retrospect analyses: ${retros.deletedCount}`);
  console.log(`  refresh sessions: ${refreshSessions.deletedCount}`);
  console.log(`  password reset tokens: ${resetTokens.deletedCount}`);
  console.log(`  audit log entries: ${audits.deletedCount}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
