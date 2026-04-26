import crypto from "crypto";

export function requestIdMiddleware(req, _res, next) {
  req.requestId = crypto.randomUUID();
  next();
}

