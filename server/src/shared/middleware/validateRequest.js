import { AppError } from "../utils/AppError.js";

export function validateRequest(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!parsed.success) {
      return next(
        new AppError("VALIDATION_ERROR", "Invalid request payload", 400, parsed.error.flatten()),
      );
    }

    req.validated = parsed.data;
    return next();
  };
}

