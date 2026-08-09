import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Access tokens are short-lived now (15 minutes); a missing/expired
    // access token with a still-valid refresh token is a normal state (e.g.
    // returning after the tab was closed for a while), not a logged-out one.
    // apiFetch itself transparently refreshes on a 401, so it's enough to
    // just skip the call entirely when NEITHER token exists at all.
    const token = localStorage.getItem("reflectai_token");
    const refreshToken = localStorage.getItem("reflectai_refresh_token");
    if (!token && !refreshToken) {
      setLoading(false);
      return;
    }
    apiFetch("/api/auth/me")
      .then((data) => setUser(data))
      .catch(() => {
        localStorage.removeItem("reflectai_token");
        localStorage.removeItem("reflectai_refresh_token");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      setUser,
      setToken: (token, refreshToken) => {
        localStorage.setItem("reflectai_token", token);
        if (refreshToken) localStorage.setItem("reflectai_refresh_token", refreshToken);
      },
      logout: () => {
        localStorage.removeItem("reflectai_token");
        localStorage.removeItem("reflectai_refresh_token");
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

