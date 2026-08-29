# Setting up Google Health (Fitbit / Pixel Watch sync)

The code is done (see `server/src/modules/googleHealth/`), but it needs real Google Cloud credentials before "Connect Google Health" in Settings does anything besides staying hidden. This is the walkthrough for that part -- the same kind of one-time setup `ios-companion/README.md` covers for Apple Health, but this half runs entirely in a browser (no Xcode).

## 1. Create a Google Cloud project and enable the API

1. Sign into the [Google Cloud console](https://console.cloud.google.com/).
2. Create a new project (any name -- "Equoria" is fine).
3. Menu -> **APIs & Services > Library** -> search "Google Health API" -> **Enable**.

## 2. Configure the OAuth consent screen

1. Menu -> **APIs & Services > Credentials** -> **+ Create Credentials > OAuth client ID**.
2. If prompted, configure the consent screen first: app name, your support email, **External** user type, your contact email, agree to the API Services User Data Policy.
3. Back on Credentials, create the OAuth client:
   - Application type: **Web application**
   - Authorized redirect URIs: add your server's callback URL exactly, e.g. `https://reflectai-server-ruhp.onrender.com/api/google-health/callback` (or `http://localhost:5000/api/google-health/callback` for local dev). This must match `GOOGLE_HEALTH_REDIRECT_URI` below byte-for-byte.
4. Save the **Client ID** and **Client secret** shown -- the secret is only ever shown once.

## 3. Add scopes and test users

While the app is in "Testing" publishing status (the default, fine for personal use):

1. **Audience** tab -> **Test users** -> add your own Google account (the one linked to your Fitbit or Pixel Watch).
2. **Data Access** tab -> **Add or remove scopes** -> search "Google Health API" and add all three this app requests:
   - `.../auth/googlehealth.activity_and_fitness.readonly`
   - `.../auth/googlehealth.sleep.readonly`
   - `.../auth/googlehealth.health_metrics_and_measurements.readonly`

Note: while your app stays in Testing mode, only accounts you've explicitly added as test users can complete the connect flow -- fine for personal/single-user use, but a real reason to move to "In production" review later if this app ever has real outside users.

## 4. Set the environment variables

On the server (Render dashboard -> your service -> Environment, or your local `.env`):

```
GOOGLE_HEALTH_CLIENT_ID=<client id from step 2>
GOOGLE_HEALTH_CLIENT_SECRET=<client secret from step 2>
GOOGLE_HEALTH_REDIRECT_URI=https://reflectai-server-ruhp.onrender.com/api/google-health/callback
```

Restart the server. `GET /api/google-health/status` will now report `available: true`, and "Connect Google Health" appears in Settings -> Integrations, right below Apple Health.

## 5. Connect and verify

1. Log into Equoria, go to Settings -> Integrations -> **Connect Google Health**.
2. Sign in with the Google account you added as a test user, approve the three scopes.
3. You're redirected back to Settings with a "Connected" message.
4. Click **Sync now** to pull the last few days immediately, rather than waiting for a scheduled run.

If steps sync but sleep or resting-heart-rate don't, check the server logs -- `service.js` logs a specific warning when Google's response doesn't match the expected shape (see the comments in `fetchSleepHoursForDay`/`fetchRestingHeartRateForDay`, which are honestly flagged as verified-by-inference rather than a confirmed live response, unlike the `steps` call).

## 6. Wire up the actual schedule

Nothing calls `npm run sync-google-health` automatically yet -- same gap as the three existing unscheduled email scripts (`send-reminders`, `send-weekly-digest`, `send-capsule-notifications`). Set up one Render cron job that runs all four, e.g. a schedule like `0 */12 * * *` (twice a day) pointed at a small shell command that runs each `npm run ...` script in sequence.
