import { logError } from "../utils/logger.js";
import { AppError } from "../utils/AppError.js";

export function notFoundHandler(req, _res, next) {
  const err = new Error(`Not found: ${req.originalUrl}`);
  err.statusCode = 404;
  err.code = "NOT_FOUND";
  next(err);
}

export function errorHandler(err, req, res, _next) {
  const isAppError = err instanceof AppError;
  const statusCode = err.statusCode || 500;
  const code = err.code || "INTERNAL_ERROR";
  const rawMessage = err.message || "Something went wrong";

  // Always log the real message and stack server-side, regardless of what
  // the client ends up seeing.
  logError(rawMessage, {
    code,
    statusCode,
    requestId: req.requestId,
    route: req.originalUrl,
    details: err.details || null,
    stack: err.stack,
  });

  // Only an intentional AppError (hand-authored, client-safe message by
  // construction) or a deliberate < 500 response (e.g. body-parser's
  // "entity too large") is safe to show verbatim. An unexpected 500 means
  // something broke in a code path nobody wrote a client-facing message
  // for -- its raw .message can leak internal detail (variable/property
  // names, driver-level error text, etc.) that was never meant to reach a
  // client. Previously every error's message was sent through unmodified.
  const safeToShowMessage = isAppError || statusCode < 500;
  const message = safeToShowMessage ? rawMessage : "Something went wrong. Please try again.";

  res.status(statusCode).json({
    code: safeToShowMessage ? code : "INTERNAL_ERROR",
    message,
    requestId: req.requestId,
    details: safeToShowMessage ? err.details || null : null,
  });
}

