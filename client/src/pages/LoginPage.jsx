import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch, describeError } from "../api";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";

export default function LoginPage() {
  const [email, setEmail] = useState("demo@reflectai.com");
  const [password, setPassword] = useState("Demo@123");
  const [error, setError] = useState("");
  const { setToken, setUser } = useAuth();
  const navigate = useNavigate();
  // Populated by any flow that force-logs-out and redirects here with a
  // reason (currently just change-password, which invalidates every session
  // -- including the one that made the change -- as soon as it succeeds).
  // Read once on mount: React Router keeps this in history state, not the
  // URL, so it survives a refresh-free redirect but doesn't linger as a
  // query param someone could bookmark or re-trigger.
  const location = useLocation();
  const [infoMessage] = useState(location.state?.message || "");

  // Set once /login responds with { twoFactorRequired: true, twoFactorToken }
  // instead of real tokens -- switches the form into a second step asking
  // for the authenticator code rather than issuing a session immediately.
  const [twoFactorToken, setTwoFactorToken] = useState(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (data.twoFactorRequired) {
        setTwoFactorToken(data.twoFactorToken);
        return;
      }
      setToken(data.token, data.refreshToken);
      setUser(data.user);
      navigate("/chat");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTwoFactorSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await apiFetch("/api/auth/2fa/login", {
        method: "POST",
        body: JSON.stringify({ twoFactorToken, code }),
      });
      setToken(data.token, data.refreshToken);
      setUser(data.user);
      navigate("/chat");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen page-gradient living-bg mood-calm text-ink flex items-center justify-center p-4">
      <motion.div
        className="w-full max-w-5xl grid md:grid-cols-2 gap-4"
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <section className="ui-card rounded-2xl p-8 hidden md:flex flex-col justify-between">
          <div>
            <p className="ui-kicker">Equoria</p>
            <h1 className="ui-title mt-3">ReflectAI Coach</h1>
            <p className="text-ink/70 mt-3 text-sm leading-6">
              A calm journaling workspace with memory-aware reflective conversations and evidence-based prompts.
            </p>
            {/* Names the actual differentiated features instead of generic
                copy -- previously this said nothing more specific than "a
                calm journaling workspace," which undersells what's actually
                here compared to the rest of the app. */}
            <ul className="text-sm text-ink/70 mt-5 space-y-2">
              <li>• Keepsakes -- flag entries worth revisiting later</li>
              <li>• Time capsules -- seal a letter to your future self</li>
              <li>• Retrospect -- real patterns in your mood over time</li>
            </ul>
          </div>
          <div className="text-sm text-ink/70">
            Demo: <span className="text-ink">demo@reflectai.com / Demo@123</span>
          </div>
        </section>

        {!twoFactorToken && (
          <form onSubmit={handleSubmit} className="ui-card rounded-2xl p-6 md:p-8 space-y-4">
            <div>
              <p className="ui-kicker">Welcome back</p>
              <h2 className="ui-title mt-1">Sign in to Equoria</h2>
            </div>
            {infoMessage && (
              <p role="status" className="text-sm text-emerald-300 bg-emerald-500/10 rounded-lg px-3 py-2">
                {infoMessage}
              </p>
            )}
            <input
              className="ui-input"
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <PasswordInput
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p role="alert" className="text-red-300 text-sm">{error}</p>}
            <button className="w-full p-3 ui-button-primary" disabled={submitting}>
              {submitting ? "Signing in..." : "Login"}
            </button>
            <p className="text-sm text-ink/70">
              <Link className="text-signal hover:text-signal-soft" to="/forgot-password">
                Forgot password?
              </Link>
            </p>
            <p className="text-sm text-ink/70">
              New here?{" "}
              <Link className="text-signal hover:text-signal-soft" to="/register">
                Create account
              </Link>
            </p>
          </form>
        )}

        {twoFactorToken && (
          <form onSubmit={handleTwoFactorSubmit} className="ui-card rounded-2xl p-6 md:p-8 space-y-4">
            <div>
              <p className="ui-kicker">Two-factor authentication</p>
              <h2 className="ui-title mt-1">Enter your code</h2>
              <p className="text-sm text-ink/70 mt-2">
                Enter the 6-digit code from your authenticator app, or one of your backup codes.
              </p>
            </div>
            <input
              className="ui-input"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              required
            />
            {error && <p role="alert" className="text-red-300 text-sm">{error}</p>}
            <button className="w-full p-3 ui-button-primary" disabled={submitting}>
              {submitting ? "Verifying..." : "Verify"}
            </button>
            <button
              type="button"
              className="text-sm text-ink/70 hover:text-ink"
              onClick={() => {
                setTwoFactorToken(null);
                setCode("");
                setError("");
              }}
            >
              Back to login
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
