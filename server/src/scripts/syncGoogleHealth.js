// Polls Google Health API (Fitbit/Pixel Watch) for every connected account
// and upserts steps/sleep/resting-heart-rate into HealthData -- the Android/
// cross-platform counterpart to the Apple Health companion app's own /sync
// push. This is a PULL, not a push: unlike the iOS companion app (which
// syncs itself, whenever HealthKit tells it new data arrived), there's no
// device-side app to trigger a sync here, so something has to periodically
// ask Google on each connected user's behalf. This script is that
// something -- meant to run on a schedule (once or twice a day is plenty;
// see docs/wearable-health-integration-spec.md's Non-goals on why this is
// polling, not real-time).
//
// Same unscheduled-cron gap as sendJournalingReminders.js/sendWeeklyDigest.js/
// sendCapsuleReadyNotifications.js -- this script is real and runnable, but
// nothing currently triggers it automatically. Wire it up the same way (see
// docs/roadmap-2026-08.md's Now bucket): Render dashboard -> New -> Cron Job
// -> command `cd server && npm run sync-google-health` -> a schedule like
// `0 */12 * * *` (twice a day) -> same env vars as the web service
// (MONGO_URI, ENCRYPTION_KEY, JWT_SECRET, GOOGLE_HEALTH_CLIENT_ID/SECRET/
// REDIRECT_URI). Ideally the same cron job also runs the other three
// unscheduled scripts, rather than standing up four separate Render cron
// jobs for one underlying "we need a scheduler" gap.
//
// Run manually via `npm run sync-google-health` from server/.
import mongoose from "mongoose";
import User from "../models/User.js";
import { env } from "../shared/config/env.js";
import { syncUserRecent } from "../modules/googleHealth/service.js";

async function run() {
  await mongoose.connect(env.MONGO_URI);

  const users = await User.find({ googleHealthRefreshToken: { $ne: null }, googleHealthNeedsReconnect: false }).select(
    "_id name googleHealthRefreshToken",
  );

  if (users.length === 0) {
    console.log("No connected Google Health accounts to sync.");
    await mongoose.disconnect();
    return;
  }

  console.log(`Syncing ${users.length} connected account(s)...`);

  let succeeded = 0;
  let failed = 0;
  for (const user of users) {
    // Independent per user -- one account's expired/revoked token (or a
    // transient Google API error) must never stop the rest of the batch
    // from syncing, same principle as sendCapsuleReadyNotifications.js
    // processing each user's notification independently.
    try {
      const results = await syncUserRecent(user);
      const syncedDays = results.filter((r) => r.synced).length;
      console.log(`${user.name}: synced ${syncedDays}/${results.length} day(s).`);
      succeeded += 1;
    } catch (error) {
      console.error(`${user.name}: sync failed -- ${error?.message || error}`);
      failed += 1;
    }
  }

  console.log(`\nDone. ${succeeded} account(s) synced, ${failed} failed.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
