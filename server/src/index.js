import cors from "cors";
import express from "express";
import authRoutes from "./modules/auth/routes.js";
import chatRoutes from "./modules/chat/routes.js";
import dashboardRoutes from "./modules/dashboard/routes.js";
import exportRoutes from "./modules/export/routes.js";
import googleHealthRoutes from "./modules/googleHealth/routes.js";
import healthRoutes from "./modules/health/routes.js";
import journalRoutes from "./modules/journal/routes.js";
import retrospectRoutes from "./modules/retrospect/routes.js";
import yearInReviewRoutes from "./modules/yearInReview/routes.js";
import { env } from "./shared/config/env.js";
import { errorHandler, notFoundHandler } from "./shared/middleware/errorHandler.js";
import { requestIdMiddleware } from "./shared/middleware/requestId.js";
import { logInfo } from "./shared/utils/logger.js";
import { runStartupChecks } from "./startup.js";

const app = express();

// See env.js for the full explanation -- every rate limiter in this app is
// keyed by req.ip, which silently becomes wrong (the proxy's IP, shared by
// every user) if this server ever runs behind a reverse proxy/load balancer
// without Express being told to trust it. Parsed from TRUST_PROXY: "1" (or
// any number) sets the proxy hop count, "true"/"false" pass through
// directly, anything else (e.g. a specific IP/CIDR) is passed through as-is
// for Express to interpret. Left unset, this matches Express's own default
// (don't trust any proxy) -- correct for local/direct use.
if (env.TRUST_PROXY) {
  const raw = env.TRUST_PROXY;
  const value = raw === "true" ? true : raw === "false" ? false : Number.isNaN(Number(raw)) ? raw : Number(raw);
  app.set("trust proxy", value);
}

// Baseline security headers. Manual instead of a new dependency (e.g. helmet)
// since this is a pure JSON API with no server-rendered HTML -- these are
// still worth setting as defense-in-depth (some browsers/embeds still honor
// them regardless of content type) without pulling in extra surface area.
app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  // Tells browsers to only ever talk to this host over HTTPS for the next
  // year (and to remember that for subdomains too), so a stray http://
  // link or a downgrade attempt can't silently send credentials/tokens over
  // plaintext. This doesn't itself terminate/redirect HTTP -- that's the
  // hosting platform or reverse proxy's job (Render, Fly.io, Nginx, etc. all
  // do this in front of the app) -- but the header is safe to always send:
  // browsers just ignore it entirely over a plain HTTP connection.
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

// Was a single-origin `origin: env.CLIENT_URL` -- correct for a web-only
// deploy, but the packaged Android app (see client/capacitor.config.ts)
// serves its WebView content from a fixed origin of its own
// (https://localhost is Capacitor's default androidScheme; capacitor://localhost
// shows up on some configurations/older versions), neither of which is
// env.CLIENT_URL. Rather than hardcoding one, allow CLIENT_URL to be a
// comma-separated list (for real web origins -- staging, production, etc.)
// and always additionally allow the two fixed Capacitor origins, since
// those identify "the native app shell," not an attacker-controlled site.
const allowedWebOrigins = new Set(
  String(env.CLIENT_URL || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);
const CAPACITOR_ORIGINS = new Set(["https://localhost", "capacitor://localhost"]);
app.use(
  cors({
    origin(origin, callback) {
      // No Origin header at all (server-to-server calls, curl, some native
      // HTTP clients) -- never sent by a browser or WebView making a real
      // cross-origin request, so allowing it here isn't a same-origin-policy
      // bypass, just a no-op for non-browser callers.
      if (!origin || allowedWebOrigins.has(origin) || CAPACITOR_ORIGINS.has(origin)) {
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(requestIdMiddleware);

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/journal", journalRoutes);
app.use("/api/retrospect", retrospectRoutes);
app.use("/api/health-data", healthRoutes);
app.use("/api/google-health", googleHealthRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/year-in-review", yearInReviewRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

runStartupChecks()
  .then(() => {
    app.listen(env.PORT, () => {
      logInfo("Server started", { port: env.PORT });
    });
  })
  .catch((error) => {
    console.error("Startup failed:", error.message);
    process.exit(1);
  });

