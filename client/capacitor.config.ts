import type { CapacitorConfig } from "@capacitor/cli";

// Packages the existing Vite/React client (client/dist, produced by `npm run
// build`) into a native Android WebView shell -- no rewrite, the same
// components/pages that run in a browser run here. See ANDROID_SETUP notes
// in the chat history / project notes for the one-time local setup (`npm
// install`, `npx cap add android`) that has to run on your own machine --
// this config file alone doesn't generate the native android/ project.
const config: CapacitorConfig = {
  // Reverse-DNS app id -- shows up in the Play Store listing URL and as the
  // Android package name. Change this before a real release if you want a
  // different one; it's painful to change after publishing since it's part
  // of the app's permanent identity on the Play Store.
  appId: "com.equoria.reflectai",
  appName: "Equoria",
  // vite build's output dir (see vite.config.js / package.json's "build"
  // script) -- this is what actually gets bundled into the native app.
  webDir: "dist",
  server: {
    // Capacitor's default Android WebView origin. The server's CORS setup
    // (server/src/index.js) explicitly allows this origin alongside
    // CLIENT_URL, so API calls from the packaged app aren't blocked.
    androidScheme: "https",
  },
};

export default config;
