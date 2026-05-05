import { logInfo } from "../utils/logger.js";

export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logInfo("HTTP request", {
      requestId: req.requestId,
      method: req.method,
      route: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(elapsedMs.toFixed(1)),
      userId: req.user?._id?.toString?.() || null,
    });
  });

  next();
}
