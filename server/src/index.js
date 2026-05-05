import cors from "cors";
import express from "express";
import helmet from "helmet";
import authRoutes from "./modules/auth/routes.js";
import chatRoutes from "./modules/chat/routes.js";
import dashboardRoutes from "./modules/dashboard/routes.js";
import healthRoutes from "./modules/health/routes.js";
import journalRoutes from "./modules/journal/routes.js";
import retrospectRoutes from "./modules/retrospect/routes.js";
import { env } from "./shared/config/env.js";
import { errorHandler, notFoundHandler } from "./shared/middleware/errorHandler.js";
import { requestIdMiddleware } from "./shared/middleware/requestId.js";
import { requestLogger } from "./shared/middleware/requestLogger.js";
import { logError, logInfo } from "./shared/utils/logger.js";
import { runStartupChecks } from "./startup.js";

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(requestIdMiddleware);
app.use(requestLogger);

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    service: "reflectai-server",
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }),
);
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/journal", journalRoutes);
app.use("/api/retrospect", retrospectRoutes);
app.use("/api/health-data", healthRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

runStartupChecks()
  .then(() => {
    app.listen(env.PORT, () => {
      logInfo("Server started", { port: env.PORT });
    });
  })
  .catch((error) => {
    logError("Startup failed", { error: error.message });
    process.exit(1);
  });

