const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiFetch(path, options = {}) {
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
      if (!res.ok) throw new Error(data.message || "Request failed");
      return data;
    } catch (error) {
      const isLastAttempt = attempt === 1;
      if (!isLastAttempt) {
        await sleep(350);
        continue;
      }
      if (error?.message?.includes("Failed to fetch")) {
        throw new Error("Connection issue. Please wait a second and try again.");
      }
      throw error;
    }
  }
}

