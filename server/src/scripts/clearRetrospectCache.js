// Deletes cached RetrospectAnalysis documents so the next page load
// regenerates fresh instead of waiting out REGEN_INTERVAL_MS (12h, see
// retrospect/service.js). Journal entries and health data are untouched --
// this only clears the cached AI-generated analysis, which is always
// safely regenerable from that real data.
//
// Run from server/: npm run clear-retrospect-cache
// Add --email=someone@example.com to only clear one user's cache.
import mongoose from "mongoose";
import RetrospectAnalysis from "../models/RetrospectAnalysis.js";
import User from "../models/User.js";
import { env } from "../shared/config/env.js";

const emailArg = process.argv.find((a) => a.startsWith("--email="));
const email = emailArg ? emailArg.split("=")[1] : null;

async function run() {
  await mongoose.connect(env.MONGO_URI);

  let filter = {};
  if (email) {
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`No user found with email ${email}.`);
      await mongoose.disconnect();
      return;
    }
    filter = { userId: user._id };
  }

  const result = await RetrospectAnalysis.deleteMany(filter);
  console.log(`Cleared ${result.deletedCount} cached retrospect analysis document(s)${email ? ` for ${email}` : ""}.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
