import mongoose from "mongoose";

// One document per login/register call (i.e. per device/browser session),
// NOT one per user -- a single per-user "current refresh token" slot would
// break multi-device use, since logging in on a second device would rotate
// the first device's token out from under it and make its next refresh look
// like theft. Each session's rotation chain is tracked independently here,
// looked up by the session's own _id (embedded in the refresh JWT as "sid").
const refreshSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    currentJti: { type: String, required: true },
    // Grace window: the just-rotated-out jti stays acceptable for a short
    // time so two near-simultaneous requests (e.g. two tabs, or a request
    // racing a background refresh) don't get treated as token theft. A jti
    // presented outside both currentJti and this grace window is genuine
    // reuse of an already-superseded token.
    previousJti: { type: String, default: null },
    previousJtiExpiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("RefreshSession", refreshSessionSchema);
