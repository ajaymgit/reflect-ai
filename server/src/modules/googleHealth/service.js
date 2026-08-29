import User from "../../models/User.js";
import { env } from "../../shared/config/env.js";
import { encryptField, decryptField } from "../../shared/utils/encryption.js";
import { fetchWithTimeout } from "../../shared/utils/fetchWithTimeout.js";
import { logError, logInfo } from "../../shared/utils/logger.js";
import { estimateStressScore, resolveStressInputs, upsertHealthDataDay } from "../health/routes.js";

// Google Health API (health.googleapis.com/v4) client -- the live REST
// successor to the legacy Fitbit Web API (sunsets September 2026) and the
// legacy Google Fit APIs (retiring end of 2026). Covers Fitbit and Pixel
// Watch data via standard OAuth 2.0, callable entirely server-side -- no
// native Android app required, unlike Apple Health (see ios-companion/).
// Endpoints/shapes below were verified against the live docs at
// developers.google.com/health/{endpoints,data-types/sleep,data-types/vitals}
// as of 2026-08-29 -- the `steps` dailyRollUp shape is directly confirmed
// from a worked example there; the sleep filter syntax and the daily
// resting-heart-rate response field name are inferred from adjacent
// confirmed examples (see the comments at each call site below) and should
// be spot-checked against a real connected account before this is trusted
// in production, the same way this project's other AI-provider integrations
// were hardened against real responses rather than assumed correct on the
// first try.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const API_BASE = "https://health.googleapis.com/v4";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

// Space-separated per Google's OAuth convention. Three scopes cover the
// three metrics this app already tracks (steps, sleep, resting heart rate)
// -- deliberately not requesting broader vitals (ECG, blood glucose, SpO2,
// irregular rhythm) this app has no use for yet; requesting scopes you don't
// use is exactly the kind of thing Google's app-verification review (see
// developers.google.com/health/app-verification) flags, and it needlessly
// widens what a compromised token could read.
const SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly", // steps
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly", // sleep sessions
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly", // resting heart rate
].join(" ");

export function isConfigured() {
  return Boolean(env.GOOGLE_HEALTH_CLIENT_ID && env.GOOGLE_HEALTH_CLIENT_SECRET && env.GOOGLE_HEALTH_REDIRECT_URI);
}

// `state` carries the user's own id through the redirect round-trip (Google
// echoes it back unchanged on the callback) -- the callback route is
// unauthenticated (it's a browser redirect from Google, not an API call
// carrying this app's own JWT), so this is how it knows which account to
// attach the resulting tokens to. Signed/verified the same way the rest of
// this app signs short-lived tokens (see routes.js), not just trusted
// as-is, so a tampered state value can't attach a stranger's Google
// connection to the wrong account.
export function buildAuthorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_HEALTH_CLIENT_ID,
    redirect_uri: env.GOOGLE_HEALTH_REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    // Forces the consent screen (and therefore a fresh refresh_token) every
    // time, not just on first-ever authorization -- Google only issues a
    // refresh_token automatically the first time an app+user pair consents;
    // without this, someone reconnecting after a revoke would get an
    // access_token but no new refresh_token to replace the one that no
    // longer works.
    prompt: "consent",
    scope: SCOPES,
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function postForm(url, body) {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.error_description || data?.error || `Google token request failed (${response.status})`);
    err.googleError = data?.error;
    err.status = response.status;
    throw err;
  }
  return data;
}

// Exchanges the one-time authorization code (from the /callback redirect)
// for an access_token + refresh_token pair, then stores the refresh_token
// encrypted on the user. The access_token from this exchange is intentionally
// not returned to the caller -- callers that need one right away (e.g. a
// "sync now" triggered immediately after connecting) should call
// getAccessToken() below like every other sync path does, so there's exactly
// one code path that ever mints an access token from a stored refresh token.
export async function connectUser(userId, authorizationCode) {
  const tokens = await postForm(TOKEN_ENDPOINT, {
    code: authorizationCode,
    client_id: env.GOOGLE_HEALTH_CLIENT_ID,
    client_secret: env.GOOGLE_HEALTH_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_HEALTH_REDIRECT_URI,
    grant_type: "authorization_code",
  });
  if (!tokens.refresh_token) {
    // Shouldn't happen given prompt=consent above, but if it does, there's
    // nothing durable to store -- surface this as a real error rather than
    // silently "connecting" a user with no way to ever sync their data.
    throw new Error("Google did not return a refresh token. Try disconnecting and reconnecting.");
  }
  await User.findByIdAndUpdate(userId, {
    googleHealthRefreshToken: tokens.refresh_token,
    googleHealthConnectedAt: new Date(),
    googleHealthNeedsReconnect: false,
  });
}

export async function disconnectUser(userId) {
  const user = await User.findById(userId).select("googleHealthRefreshToken");
  const raw = user?.googleHealthRefreshToken ? decryptField(user.googleHealthRefreshToken) : null;
  if (raw) {
    // Best-effort -- revoking tells Google to invalidate the token on its
    // side too (so it stops showing up in the user's "connected apps" list
    // as active), but this app's own disconnect must succeed regardless of
    // whether Google's revoke call happens to fail (network hiccup, token
    // already invalid), since the user-facing action here is "forget this
    // token locally," not "wait on Google."
    try {
      await postForm(REVOKE_ENDPOINT, { token: raw });
    } catch (error) {
      logError("Google Health token revoke failed (continuing with local disconnect)", {
        error: error?.message || String(error),
      });
    }
  }
  await User.findByIdAndUpdate(userId, {
    googleHealthRefreshToken: null,
    googleHealthConnectedAt: null,
    googleHealthNeedsReconnect: false,
  });
}

// Mints a fresh access_token from the stored refresh_token. Access tokens
// are short-lived (~1hr per Google's docs) and never stored -- every sync
// call gets a new one, same "don't persist what you can cheaply re-derive"
// principle as this app's short-lived JWT access tokens.
export async function getAccessToken(user) {
  const raw = user.googleHealthRefreshToken ? decryptField(user.googleHealthRefreshToken) : null;
  if (!raw) return null;
  try {
    const tokens = await postForm(TOKEN_ENDPOINT, {
      refresh_token: raw,
      client_id: env.GOOGLE_HEALTH_CLIENT_ID,
      client_secret: env.GOOGLE_HEALTH_CLIENT_SECRET,
      grant_type: "refresh_token",
    });
    return tokens.access_token;
  } catch (error) {
    // invalid_grant is Google's code for "this refresh token no longer
    // works" -- revoked by the user, or expired from 6 months of disuse
    // (see Google's docs). Any other error (network blip, 5xx) is treated
    // as transient and should NOT flip needsReconnect, since that would
    // wrongly ask a user to re-consent over a problem that will resolve on
    // its own next sync attempt.
    if (error.googleError === "invalid_grant") {
      await User.findByIdAndUpdate(user._id, { googleHealthNeedsReconnect: true });
    }
    throw error;
  }
}

function civilDay(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

async function fetchStepsForDay(accessToken, dateStr) {
  // Confirmed shape -- see developers.google.com/health/endpoints's own
  // dailyRollUp worked example for the `steps` data type.
  const { year, month, day } = civilDay(dateStr);
  const response = await fetchWithTimeout(`${API_BASE}/users/me/dataTypes/steps/dataPoints:dailyRollUp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      range: {
        start: { date: { year, month, day }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } },
        end: { date: { year, month, day }, time: { hours: 23, minutes: 59, seconds: 59, nanos: 0 } },
      },
      windowSizeDays: 1,
    }),
  });
  if (!response.ok) throw new Error(`Google Health steps request failed (${response.status})`);
  const data = await response.json();
  const point = data?.rollupDataPoints?.[0];
  const count = Number(point?.steps?.countSum);
  return Number.isFinite(count) ? Math.round(count) : undefined;
}

async function fetchSleepHoursForDay(accessToken, dateStr) {
  // Sleep is a Session-type data type (list/get/reconcile/create/update/
  // batchDelete -- no rollup support, per developers.google.com/health/
  // data-types/sleep's own type table), so this sums stage durations itself
  // from the `list` endpoint's raw sessions, the same approach
  // ios-companion/ReflectHealthSync/HealthKitManager.swift already takes for
  // HealthKit's own sleep data -- two independent platforms, same honest
  // "sum the actual asleep intervals" method, so a sleepHours number means
  // the same thing regardless of which sync path produced it.
  //
  // The filter syntax below (`sleep.interval.civil_start_time >= "..."`)
  // mirrors the one worked example on developers.google.com/health/endpoints
  // (which filters `exercise.interval.civil_start_time`) applied to the
  // `sleep` data type by the same pattern -- not independently confirmed
  // with a live sleep response, so double-check this against
  // developers.google.com/health/filters if it comes back empty for an
  // account known to have sleep data.
  const filter = `sleep.interval.civil_start_time >= "${dateStr}T00:00:00" AND sleep.interval.civil_start_time < "${dateStr}T23:59:59"`;
  const response = await fetchWithTimeout(
    `${API_BASE}/users/me/dataTypes/sleep/dataPoints?filter=${encodeURIComponent(filter)}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`Google Health sleep request failed (${response.status})`);
  const data = await response.json();
  const sessions = data?.dataPoints || [];
  let totalMs = 0;
  for (const dp of sessions) {
    const stages = dp?.sleep?.stages || [];
    for (const stage of stages) {
      if (stage.type === "AWAKE") continue; // count only actual sleep, not time-in-bed
      const start = new Date(stage.startTime).getTime();
      const end = new Date(stage.endTime).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) totalMs += end - start;
    }
  }
  if (totalMs === 0) return undefined;
  return Number((totalMs / 3600000).toFixed(2));
}

async function fetchRestingHeartRateForDay(accessToken, dateStr) {
  // NOT independently confirmed -- developers.google.com/health/data-types/
  // vitals lists `daily-resting-heart-rate` (list, reconcile; Record type:
  // Daily) but its worked REST examples cover `heart-rate` (intraday,
  // `beatsPerMinute` string) and `daily-resting-heart-rate` isn't shown with
  // a full example response. This checks a few plausible field paths
  // (following the `steps.countSum` / `heartRate.beatsPerMinute` naming
  // pattern seen elsewhere) and logs a warning if none match, rather than
  // silently returning undefined and looking like "no data" -- so a real
  // test run against a connected account surfaces the mismatch instead of
  // hiding it.
  const filter = `daily_resting_heart_rate.date >= "${dateStr}" AND daily_resting_heart_rate.date <= "${dateStr}"`;
  const response = await fetchWithTimeout(
    `${API_BASE}/users/me/dataTypes/daily-resting-heart-rate/dataPoints?filter=${encodeURIComponent(filter)}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`Google Health resting-heart-rate request failed (${response.status})`);
  const data = await response.json();
  const point = data?.dataPoints?.[0]?.dailyRestingHeartRate;
  const candidate =
    point?.beatsPerMinute ?? point?.bpm ?? point?.value ?? point?.restingHeartRate ?? undefined;
  const value = Number(candidate);
  if (candidate !== undefined && !Number.isFinite(value)) {
    logInfo("Google Health daily-resting-heart-rate response shape didn't match any expected field -- verify against a live response", {
      receivedKeys: point ? Object.keys(point) : [],
    });
  }
  return Number.isFinite(value) ? Math.round(value) : undefined;
}

// Syncs one calendar day for one user -- mirrors /api/health-data/sync's own
// shape exactly (same upsertHealthDataDay, same estimateStressScore, same
// resolveStressInputs fallback-to-existing-data behavior) so a
// "google_health" row is indistinguishable in structure from an
// "apple_health" one to every downstream consumer (Retrospect, Health page,
// Year in Review).
export async function syncUserDay(user, dateStr) {
  const accessToken = await getAccessToken(user);
  if (!accessToken) return { synced: false, reason: "not_connected" };

  const [steps, sleepHours, restingHeartRate] = await Promise.all([
    fetchStepsForDay(accessToken, dateStr).catch((err) => {
      logError("Google Health steps fetch failed", { userId: String(user._id), date: dateStr, error: err.message });
      return undefined;
    }),
    fetchSleepHoursForDay(accessToken, dateStr).catch((err) => {
      logError("Google Health sleep fetch failed", { userId: String(user._id), date: dateStr, error: err.message });
      return undefined;
    }),
    fetchRestingHeartRateForDay(accessToken, dateStr).catch((err) => {
      logError("Google Health resting-heart-rate fetch failed", { userId: String(user._id), date: dateStr, error: err.message });
      return undefined;
    }),
  ]);

  const providedCount = [steps, sleepHours, restingHeartRate].filter((v) => v !== undefined).length;
  if (providedCount === 0) return { synced: false, reason: "no_data" };

  const date = new Date(`${dateStr}T00:00:00`);
  const stressInputs = await resolveStressInputs(user._id, date, { restingHeartRate, sleepHours });
  const update = {
    source: "google_health",
    completeness: Number((providedCount / 3).toFixed(2)),
    confidence: 0.85,
    stressScore: estimateStressScore(stressInputs),
  };
  if (steps !== undefined) update.steps = steps;
  if (sleepHours !== undefined) update.sleepHours = sleepHours;
  if (restingHeartRate !== undefined) update.restingHeartRate = restingHeartRate;

  await upsertHealthDataDay({ userId: user._id, date }, update);
  return { synced: true, providedCount };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Syncs today plus the previous couple of days (not just today) -- device
// data often lags a sync cycle behind (a watch that syncs to the phone
// overnight, a phone that syncs to Google in the background on its own
// schedule), so a poll that only ever asked for "today" would systematically
// miss data that shows up a day late. Matches the "hot load" window Google's
// own historical-data guidance recommends (developers.google.com/health/
// endpoints's "phased data sync" section) without the "cold load" full
// history backfill, which is future scope (see the spec's Non-goals).
export async function syncUserRecent(user, days = 3) {
  const results = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = isoDate(d);
    try {
      results.push({ date: dateStr, ...(await syncUserDay(user, dateStr)) });
    } catch (error) {
      results.push({ date: dateStr, synced: false, reason: error.message });
    }
  }
  return results;
}
