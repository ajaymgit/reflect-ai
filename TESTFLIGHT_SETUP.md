# Codemagic + TestFlight Setup (No Personal Mac Needed)

This project already includes `codemagic.yaml` for iOS build and TestFlight publish.

## 1) Push Code to GitHub

Codemagic builds from a Git repository.

## 2) Create iOS App in App Store Connect

1. Open App Store Connect -> Apps -> `+` -> New App.
2. Platform: iOS.
3. Bundle ID: `com.equoria.reflectai`.
4. Save and note the numeric Apple App ID.

## 3) Connect Codemagic to Apple

In Codemagic project settings:

1. Add **App Store Connect API key** integration.
2. Add **Code signing certificates/profiles** for App Store distribution.
3. Ensure provisioning is for bundle id `com.equoria.reflectai`.

## 4) Add Environment Variables in Codemagic

Create a group named `app_store_credentials` and add:

- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_KEY_IDENTIFIER`
- `APP_STORE_CONNECT_PRIVATE_KEY`

Optional:

- `VITE_API_URL` = your production backend URL (for app API calls)

Also set workflow var:

- `APP_STORE_APPLE_ID` = numeric App Store app ID

## 5) Trigger Build

1. Push to `main` branch.
2. Codemagic runs `ios_testflight` workflow automatically.
3. IPA is built and uploaded to TestFlight.

## 6) HealthKit Checklist (Important)

HealthKit is configured in project files:

- `ios/App/App/Info.plist` usage descriptions added.
- `ios/App/App/App.entitlements` includes `com.apple.developer.healthkit`.

Before release, ensure App Store Connect privacy answers mention Health data usage exactly as implemented.

## 7) Install on iPhone

1. In App Store Connect, add internal testers in TestFlight.
2. On iPhone, install TestFlight app.
3. Accept invite and install ReflectAI build.
