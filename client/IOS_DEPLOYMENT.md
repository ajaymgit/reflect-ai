# iOS Deployment Setup (ReflectAI)

This project is prepared with Capacitor for iOS deployment and Apple Health integration.

## Installed Dependencies

- `@capacitor/core`
- `@capacitor/cli`
- `@capacitor/ios`
- `@capgo/capacitor-health`

## Available npm Scripts

- `npm run ios:build` -> builds web app and syncs iOS project
- `npm run ios:open` -> opens Xcode workspace
- `npm run cap:sync` -> syncs all Capacitor platforms

## Apple Health Configuration

Already added in `ios/App/App/Info.plist`:

- `NSHealthShareUsageDescription`
- `NSHealthUpdateUsageDescription`

Still required in Xcode:

1. Open `ios/App/App.xcworkspace` in Xcode.
2. Select target `App` -> `Signing & Capabilities`.
3. Click `+ Capability` and add **HealthKit**.
4. Ensure a valid Apple Team, Bundle Identifier, and Provisioning Profile are selected.

## Running on an iPhone

1. In `client`, run:
   - `npm install`
   - `npm run ios:build`
   - `npm run ios:open`
2. Connect iPhone via USB (or use same network for wireless deploy).
3. In Xcode, select your iPhone as run target.
4. Press Run.

## API Base URL Note

`client/src/api.js` defaults to `http://localhost:5000`.
On physical iPhone, `localhost` points to the phone itself.

Use your laptop LAN IP in a `.env` file for iPhone testing:

`VITE_API_URL=http://<YOUR_LAPTOP_IP>:5000`

Then rebuild:

- `npm run ios:build`
