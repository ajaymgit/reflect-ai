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
    // Raw User-Agent header from the request that created this session
    // (login/register), used only to render a human-readable "Chrome on
    // macOS" label in Settings -> Active sessions -- see humanizeUserAgent()
    // in auth/routes.js. Never used for any security decision (User-Agent is
    // trivially spoofable), purely a display convenience. Capped well under
    // any realistic real-world UA string length so a malicious/malformed
    // header can't be used to stuff an oversized document into this
    // collection.
    userAgent: { type: String, default: "", maxlength: 512 },
    // Bumped on every successful /refresh (and set at creation) -- lets
    // Active sessions show "last active 2 hours ago" per device and sort by
    // recency, rather than only ever showing when the session was first
    // created. Deliberately NOT bumped by ordinary access-token-authenticated
    // requests (that would mean a DB write on nearly every API call this app
    // makes) -- refresh only happens every ~15 minutes at most per device, so
    // this stays a reasonably fresh "last active" signal without that cost.
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.model("RefreshSession", refreshSessionSchema);
