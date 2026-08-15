# ReflectHealthSync (iOS companion app)

A small SwiftUI app whose only job is: read step count, sleep, resting heart
rate, and heart rate variability from Apple Health, and send them to your
ReflectAI server so the Health page shows real numbers instead of demo data.

This can't be built or run from Claude directly -- there's no Xcode or macOS
build toolchain available in that environment. Everything below is written
so you can create the project yourself in Xcode and drop these files in.

## Why a separate app at all

Apple only allows HealthKit access from native iOS apps, never from a web
browser or web view. That's an Apple platform restriction, not something
fixable in ReflectAI's own React/Express code -- see `HealthKitManager.swift`
below for the actual HealthKit calls.

## 1. Create the Xcode project

1. Open Xcode -> **File > New > Project**.
2. Choose **iOS > App**, click Next.
3. Product Name: `ReflectHealthSync`. Interface: **SwiftUI**. Language: **Swift**.
4. Save it anywhere convenient (does not need to be inside the `reflect-ai`
   folder -- it's a separate Xcode project, just tracked in this repo for
   reference).

## 2. Add the HealthKit capability

1. Select the project in the navigator -> your target -> **Signing & Capabilities**.
2. Click **+ Capability** -> add **HealthKit**.
3. Under **Signing**, pick your own Apple ID as the team (the free tier is
   enough to install on your own device).

## 3. Add the required Info.plist entries

In the target's **Info** tab, add:

| Key | Value |
|---|---|
| `NSHealthShareUsageDescription` | "ReflectHealthSync reads your step count, sleep, and heart rate to sync with your ReflectAI journal." |

(`NSHealthUpdateUsageDescription` is only needed if the app ever *writes* to
Health, which it doesn't -- read-only.)

## 4. Add the source files

Drag these three files from `ios-companion/ReflectHealthSync/` into your
Xcode project (make sure "Copy items if needed" is checked), replacing the
default `ContentView.swift` and `ReflectHealthSyncApp.swift` Xcode generated:

- `ReflectHealthSyncApp.swift` -- app entry point
- `ContentView.swift` -- setup screen (paste your server URL + sync token, connect, manual sync, status)
- `HealthKitManager.swift` -- HealthKit authorization + queries + background delivery + the actual sync POST

## 5. Run it

1. Plug in your iPhone, select it as the run destination (HealthKit needs a
   real device -- the Simulator has no real health data).
2. Build and run (Cmd+R). First launch, iOS will ask you to trust your
   developer certificate: **Settings > General > VPN & Device Management**
   on the phone.
3. In the app, open **Settings**, get your sync token from ReflectAI's own
   Settings page ("Generate sync token" under Integrations), and paste in:
   - **Server URL**: your ReflectAI server's address (e.g. `http://192.168.1.x:5001` if
     testing on the same Wi-Fi as your Mac -- `localhost` on the phone means
     the phone itself, not your computer)
   - **Sync token**: the token you copied
4. Tap **Connect** -- this triggers the HealthKit permission prompt. Allow
   access to Steps, Sleep Analysis, Resting Heart Rate, and Heart Rate
   Variability.
5. Tap **Sync Now** to send today's data immediately, or leave background
   delivery enabled to sync automatically as new Health data arrives.

## How the sync data maps to ReflectAI

| HealthKit data | Sent as | Used for |
|---|---|---|
| `HKQuantityTypeIdentifier.stepCount` (daily sum) | `steps` | Steps stat, weekly trend chart |
| `HKCategoryTypeIdentifier.sleepAnalysis` (asleep time, summed per night) | `sleepHours` | Sleep stat, weekly trend chart |
| `HKQuantityTypeIdentifier.restingHeartRate` | `restingHeartRate` | Heart rate stat |
| `HKQuantityTypeIdentifier.heartRateVariabilitySDNN` | `heartRateVariability` | Only used server-side to estimate a stress score -- not stored directly |

Apple doesn't expose a "stress score" through HealthKit at all -- ReflectAI's
server derives an approximate one from resting heart rate, sleep, and HRV
(see `estimateStressScore` in `server/src/modules/health/routes.js`). It's a
simple heuristic, not a medical-grade measurement.

## Background sync

`HealthKitManager.swift` registers `HKObserverQuery` with background delivery
enabled for each data type, so iOS wakes the app when new Health data shows
up and it syncs automatically -- no need to keep the app open. How promptly
that happens is controlled by iOS, not by this app (typically within the
hour, sometimes faster).

## Sleep tracking without an Apple Watch

Real sleep *stage* data (light/deep/REM) genuinely requires a Watch -- there's
no way around that, it needs continuous heart rate. But total time asleep can
be estimated from the iPhone alone using actigraphy (inferring sleep/wake
from movement), the same underlying technique phone-only sleep apps like
Sleep Cycle use. The `equohealth` build of this app (`equohealth/MyApp/`, not
the source-only `ReflectHealthSync/` reference copy above) includes this as
`SleepSessionRecorder.swift`:

- Tap **Start Sleep Tracking** before bed. It plays a silent audio loop --
  inaudible, but it's what legitimately keeps the app alive in the
  background overnight (the `audio` `UIBackgroundMode`, already set in this
  project's build settings) -- while `CMMotionManager` samples the
  accelerometer every 30 seconds.
- Tap **Stop & Save** when you wake (or it auto-stops after 12h as a safety
  net). It splits the session into 5-minute windows, calls a window "still"
  if movement variance stays under a small threshold, and sums the still
  windows into a `sleepHours` number -- the exact same field HealthKit's own
  sleep analysis produces, so it flows through the rest of this app (Health
  page, wellness score, correlations) identically either way.
- The recorded still-periods are written back into HealthKit's own Sleep
  Analysis category (needs one more permission grant, `NSHealthUpdateUsageDescription`,
  already added to the project), so the data isn't trapped only inside this
  app -- it shows up in Apple's own Health app too.

This is an approximate heuristic, not a medical measurement -- the same
honest caveat as `estimateStressScore` on the server side. It's meant to
replace an empty wellness score with a real one, not to compete with actual
sleep-stage tracking.
