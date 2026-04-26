import { logError } from "../utils/logger.js";

export function notFoundHandler(req, _res, next) {
  const err = new Error(`Not found: ${req.originalUrl}`);
  err.statusCode = 404;
  err.code = "NOT_FOUND";
  next(err);
}

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || "INTERNAL_ERROR";
  const message = err.message || "Something went wrong";

  logError(message, {
    code,
    statusCode,
    requestId: req.requestId,
    route: req.originalUrl,
    details: err.details || null,
  });

  res.status(statusCode).json({
    code,
    message,
    requestId: req.requestId,
    details: err.details || null,
  });
}

