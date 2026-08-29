# Spec: Real wearable health data (Phase 2 -- Android/cross-platform)

## Correction before anything else

My last message said wearable integration "needs a native app shell, not something to build blind in a web sandbox." That was wrong, and worth flagging directly rather than quietly writing around it: **Apple Health is already fully built.** `server/src/modules/health/routes.js` has a working `POST /sync` endpoint, `server/src/shared/middleware/healthSyncAuth.js` handles token auth, Settings has a full "Integrations" section with token generation and a QR code, and `ios-companion/` contains a complete SwiftUI companion app (HealthKit read access for steps/sleep/resting heart rate/HRV, background delivery, even an accelerometer-based sleep tracker for iPhone-only users without a Watch). It was built and committed August 15 -- earlier in this same project than my working context covered, which is why I missed it. It's real, it's done in code, and the only remaining step is one only you can do: open Xcode on your own Mac, follow `ios-companion/README.md`, and build it onto your phone. I can't compile or run Swift/Xcode from here.

So this spec is scoped to the part that's actually still open: **Android and cross-platform wearables** (Fitbit, Pixel Watch, Samsung Health, and similar) via a real, currently-live web API -- no native app required for this half.

## Problem statement

Equoria's health-mood correlation (Retrospect, Health page, Year in Review) is rated Strong in the competitive brief -- on par with only Stoic in the category -- but every data point today is either manually typed in or, for Apple Health users who build the companion app, synced from one platform. Anyone on Android, or anyone with a Fitbit/Pixel Watch/Samsung device rather than an iPhone, has no path to real data at all, and manual entry is well-documented (in this app's own commit history and in general UX research) as something people do inconsistently, which directly weakens the correlation math it feeds.

## Goals

- Let a user with a Fitbit, Pixel Watch, or other Google Health API-connected device sync real steps/sleep/heart-rate data with zero manual entry, mirroring what the Apple companion app already does for iPhone users.
- Reuse the existing `HealthData` schema and upsert-by-day pattern exactly as `/sync` already does, so Retrospect/Health/Year-in-Review need no changes to consume this data -- it should look identical to Apple-sourced rows to every downstream consumer.
- Close the "Android users get nothing" gap without requiring a native Android app or Capacitor/React Native shell -- this should be a pure server-side OAuth integration, buildable and testable entirely in this environment.
- Ship a v1 that's honest about being a heuristic, not a medical measurement, matching the existing `estimateStressScore` disclosure pattern.

## Non-goals

- **Health Connect / on-device Android integration.** Health Connect is Android-only and on-device (not a cloud REST API) -- reaching it requires a native Android app, the same category of work as the Apple companion app but for a second platform. Out of scope for this phase; the Google Health API below reaches Fitbit and Pixel Watch data without it.
- **Building against the legacy Google Fit API or legacy Fitbit Web API.** Both are being retired: Google Fit APIs stop working by end of 2026, and the legacy Fitbit Web API sunsets in September 2026 -- essentially now. New integrations should target the Google Health API directly; building against either legacy API today would mean migrating almost immediately.
- **Samsung Health direct integration.** Samsung Health has its own separate partner-only SDK, not reachable through the Google Health API. Samsung device data may still arrive indirectly if a user's phone routes it through Fitbit/Google's ecosystem, but a direct Samsung integration is a separate, future scope.
- **Real-time/continuous sync.** The existing Apple companion app uses HealthKit's background delivery for near-real-time updates; a first Android/cross-platform version should poll periodically (e.g., once or twice a day), not attempt push-based real-time sync.
- **Any change to how Retrospect/Health/Year-in-Review consume `HealthData`.** This is purely a new ingestion path into the existing schema; the read side is explicitly untouched.

## User stories

- As an Android or Fitbit/Pixel Watch user, I want to connect my device in Settings the same way an iPhone user connects theirs, so I get the same real-data correlation experience regardless of platform.
- As a user who's already connected, I want my steps/sleep/heart-rate data to show up in Health/Retrospect/Year-in-Review automatically, without re-entering anything.
- As a privacy-conscious user, I want to see exactly what data is being pulled and be able to disconnect at any time, the same transparency the Apple path already gives via a visible, revocable sync token.
- As a returning user whose Google OAuth token expires or is revoked, I want a clear "reconnect" state instead of silent data gaps with no explanation.

## Requirements

### Must-Have (P0)

**Google Cloud project + OAuth 2.0 client setup.** A first-time-ever OAuth integration for this app (no existing OAuth flow to extend). Requires a Google Cloud project, Google Health API enabled, and an OAuth 2.0 client (web application type) with a redirect URI pointing at the Equoria server.
- Acceptance: `GOOGLE_HEALTH_CLIENT_ID` / `GOOGLE_HEALTH_CLIENT_SECRET` configurable via env, matching this codebase's existing `env.js` pattern for provider keys.

**Connect flow in Settings' existing Integrations section.** A "Connect Google Health" button next to the existing Apple Health card, starting the OAuth consent flow (Google's hosted consent screen, not a custom login form -- this app should never see or store the user's Google password).
- Given a user clicks "Connect Google Health" in Settings, when they approve the Google OAuth consent screen, then the server stores an encrypted refresh token tied to their account and shows a "Connected" state.
- Given a user has already connected, when they revisit Settings, then they see their connection status and a "Disconnect" action that deletes the stored token server-side.

**Server-side polling sync job.** A scheduled job (reusing whatever cron mechanism ends up wiring the already-built-but-unscheduled email scripts -- see `docs/roadmap-2026-08.md`'s Now bucket) that, for each connected user, calls the Google Health API's `list`/`dailyRollUp` endpoints for steps, sleep, and heart rate, and upserts into `HealthData` via the same `upsertHealthDataDay` helper `/sync` and `/manual-entry` already share.
- Acceptance: a synced row sets `source: "google_health"` (mirroring `"apple_health"`/`"manual"`), so Health/Retrospect/Year-in-Review can attribute data provenance identically to how they already do for Apple.
- Acceptance: a sync failure for one user (expired token, API error) must not block sync for any other user -- process independently per user, log and skip on failure.

**Token refresh and expiry handling.** Google OAuth refresh tokens can be revoked by the user from their Google Account at any time, outside this app entirely.
- Given a stored refresh token is rejected by Google, when the next scheduled sync runs for that user, then their connection status flips to "Needs reconnecting" (visible in Settings) instead of failing silently forever.

### Nice-to-Have (P1)

**Manual "Sync now" button in Settings**, mirroring the Apple companion app's "Sync Now" action, for a user who doesn't want to wait for the next scheduled poll.

**Last-synced timestamp** shown next to the connection status, so a user can tell at a glance whether the integration is actually working.

**Resting heart rate variability (HRV), if the Google Health API exposes it for the connected device**, feeding the same `estimateStressScore` heuristic the Apple path already uses -- keeps stress-score quality consistent regardless of platform.

### Future Considerations (P2)

**Health Connect native Android companion app**, mirroring the iOS one, for on-device Android health sources the Google Health API doesn't reach (e.g., Samsung Health data that never syncs through Google's ecosystem).

**Multi-device handling** -- if a user has both a Fitbit and a Pixel Watch, decide how conflicting same-day readings should be reconciled (currently `HealthData` assumes one row per user per day; the Google Health API's `reconcile` endpoint exists specifically for this and should be evaluated then, not designed for now).

## Success metrics

**Leading**: % of Android/non-Apple users who complete the Google Health connect flow within their first week of being shown it in Settings; number of days per connected user with a real (non-manual) `HealthData` row in the 30 days after connecting, compared to that same user's manual-entry frequency in the 30 days before.

**Lagging**: change in health-correlation `confidence` score (already computed and stored on `RetrospectAnalysis`) for users who connect a device, before vs. after connecting -- the direct test of whether this actually improves the thing it's meant to improve, not just a vanity connection-count metric.

## Open questions

- **Engineering**: does Render's free/current tier support a scheduled background job cleanly, or does this ride on the same cron-job gap already flagged in `docs/roadmap-2026-08.md` for the unscheduled email scripts? Worth solving both at once rather than standing up two separate scheduling mechanisms.
- **Legal/privacy**: storing an OAuth refresh token for a third-party health data provider is a meaningfully bigger privacy surface than anything currently in this app (which otherwise holds only data the user typed themselves). Worth a plain-language line in the Privacy Policy page before shipping, not just a Settings UI disclosure.
- **Product**: is Fitbit/Pixel Watch coverage actually where your users are, or would it be worth a quick informal check (even just asking a few people) before building a full OAuth integration for a device ecosystem you may not have real demand signal for yet? Unlike the Apple path (already built on spec), this is new work worth a cheap gut-check first.

## Timeline considerations

No hard external deadline, but one real one worth naming: the legacy Fitbit Web API sunsets September 2026 -- if any exploration/prototyping happens against Fitbit's API directly, it must target the new Google Health API (`health.googleapis.com/v4`), not the legacy endpoint, or it will need to be rebuilt within weeks.

Suggested phasing: land the OAuth connect flow and manual "Sync now" first (P0 + the P1 manual sync button) behind a simple always-on poll triggered by that manual button, before investing in the scheduled background job -- that de-risks the OAuth/API integration itself before adding the separate (and currently unsolved) scheduling infrastructure problem on top of it.
