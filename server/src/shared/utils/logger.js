export function logInfo(message, meta = {}) {
  console.log(
    JSON.stringify({
      level: "info",
      message,
      ...meta,
      timestamp: new Date().toISOString(),
    }),
  );
}

export function logError(message, meta = {}) {
  console.error(
    JSON.stringify({
      level: "error",
      message,
      ...meta,
      timestamp: new Date().toISOString(),
    }),
  );
}

