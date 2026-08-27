const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Paths where a 401 means "wrong credentials" or "this refresh token itself
// is invalid" -- never a signal to attempt a token refresh (that would either
// be nonsensical or, for /refresh, recurse).
const NO_REFRESH_RETRY_PATHS = new Set(["/api/auth/login", "/api/auth/register", "/api/auth/refresh"]);

async function apiFetchOnce(path, options = {}) {
  const token = localStorage.getItem("reflectai_token");
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `${API_URL}${path}`;
  const requestOptions = { ...options, headers };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, requestOptions);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.message || "Request failed");
        // Zod's per-field validation messages (data.details.fieldErrors) were
        // computed server-side but previously never left this function --
        // callers only ever saw the generic top-level message. Attaching them
        // here lets a page show the user which field/rule actually failed.
        err.details = data.details;
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (error) {
      // Only retry genuine network failures (fetch() itself throwing, e.g.
      // a dropped connection) -- those never carry a `.status`, since no
      // response was ever received. A defined `.status` means the server
      // did respond and this function deliberately threw (wrong password,
      // a validation error, a rate limit, a 500). Retrying those used to
      // happen unconditionally here, which silently double-fired every
      // failed request: a mistyped password consumed two hits against the
      // login rate limiter instead of one, and any POST that failed with a
      // 5xx after already writing to the database (a real possibility, not
      // hypothetical) could create a duplicate. Confirmed live: a 401 from
      // a wrong password used to show up ~350ms slower than a 429, because
      // it was quietly retrying once before surfacing the error at all.
      const isNetworkFailure = error?.status === undefined;
      const isLastAttempt = attempt === 1;
      if (isNetworkFailure && !isLastAttempt) {
        await sleep(350);
        continue;
      }
      if (isNetworkFailure && error?.message?.includes("Failed to fetch")) {
        throw new Error("Connection issue. Please wait a second and try again.");
      }
      throw error;
    }
  }
}

// Access tokens are short-lived (15 minutes -- see server/src/shared/utils/tokens.js)
// so the user isn't stuck re-entering their password every 15 minutes, this
// exchanges the longer-lived refresh token for a fresh access token
// transparently whenever a request comes back 401. Concurrent 401s (e.g.
// several requests in flight at once when the token expires) share a single
// in-flight refresh call instead of each firing their own.
let refreshPromise = null;

function refreshAccessToken() {
  const refreshToken = localStorage.getItem("reflectai_refresh_token");
  if (!refreshToken) return Promise.resolve(null);
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        if (!data?.token) return null;
        // Refresh tokens now rotate on every use (server/src/modules/auth/routes.js) --
        // the refresh token just sent above is now spent, so the new one
        // returned here must replace it in storage or the next refresh
        // attempt will look like reuse of a stale token and revoke the
        // session.
        if (data.refreshToken) {
          localStorage.setItem("reflectai_refresh_token", data.refreshToken);
        }
        return data.token;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiFetch(path, options = {}) {
  try {
    return await apiFetchOnce(path, options);
  } catch (error) {
    if (error?.status === 401 && !NO_REFRESH_RETRY_PATHS.has(path)) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        localStorage.setItem("reflectai_token", newToken);
        return apiFetchOnce(path, options);
      }
      // Refresh token missing, expired, or revoked (e.g. logout-all) --
      // there is no way to recover this session client-side. Clear both
      // tokens so the next auth check (AuthContext's mount effect, or the
      // next protected-route navigation) correctly treats this as logged out,
      // instead of silently retrying a dead access token forever.
      localStorage.removeItem("reflectai_token");
      localStorage.removeItem("reflectai_refresh_token");
    }
    throw error;
  }
}

// Prefers the specific, server-computed field-validation messages (e.g. "String
// must contain at least 8 character(s)") over the generic "Invalid request
// payload" top-level message, when both are available.
export function describeError(err) {
  const fieldErrors = err?.details?.fieldErrors?.body;
  if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
    return fieldErrors.join("; ");
  }
  return err?.message || "Something went wrong. Please try again.";
}
