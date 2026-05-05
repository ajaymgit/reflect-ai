const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const REQUEST_TIMEOUT_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("reflectai_token");
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = { ...(options.headers || {}) };
  if (hasBody && !isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `${API_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const requestOptions = { ...options, headers, signal: controller.signal };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, requestOptions);
      const raw = await res.text().catch(() => "");
      let data = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem("reflectai_token");
        }
        throw new Error(data?.message || "Request failed");
      }
      return data;
    } catch (error) {
      const isLastAttempt = attempt === 1;
      if (!isLastAttempt) {
        await sleep(350);
        continue;
      }
      if (error?.name === "AbortError") {
        throw new Error("Request timed out. Please try again.");
      }
      if (error?.message?.includes("Failed to fetch") || error?.message?.includes("NetworkError")) {
        throw new Error("Connection issue. Please wait a second and try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

