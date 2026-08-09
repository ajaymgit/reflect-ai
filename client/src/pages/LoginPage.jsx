import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, describeError } from "../api";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput";

export default function LoginPage() {
  const [email, setEmail] = useState("demo@reflectai.com");
  const [password, setPassword] = useState("Demo@123");
  const [error, setError] = useState("");
  const { setToken, setUser } = useAuth();
  const navigate = useNavigate();

  // Set once /login responds with { twoFactorRequired: true, twoFactorToken }
  // instead of real tokens -- switches the form into a second step asking
  // for the authenticator code rather than issuing a session immediately.
  const [twoFactorToken, setTwoFactorToken] = useState(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    <div className="min-h-screen page-gradient living-bg mood-calm text-white flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-4">
        <section className="ui-card rounded-3xl p-8 hidden md:flex flex-col justify-between">
          <div>
            <p className="ui-kicker">Equoria</p>
            <h1 className="ui-title mt-3">ReflectAI Coach</h1>
            <p className="text-white/70 mt-3 text-sm leading-6">
              A calm journaling workspace with memory-aware reflective conversations and evidence-based prompts.
            </p>
          </div>
          <div className="text-sm text-white/70">
            Demo: <span className="text-white">demo@reflectai.com / Demo@123</span>
          </div>
        </section>

        {!twoFactorToken && (
          <form onSubmit={handleSubmit} className="ui-card rounded-3xl p-6 md:p-8 space-y-4">
            <div>
              <p className="ui-kicker">Welcome back</p>
              <h2 className="ui-title mt-1">Sign in to Equoria</h2>
            </div>
            <input
              className="ui-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <PasswordInput
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-red-300 text-sm">{error}</p>}
            <button className="w-full p-3 ui-button-primary" disabled={submitting}>
              {submitting ? "Signing in..." : "Login"}
            </button>
            <p className="text-sm text-white/70">
              <Link className="text-[#d9d2b0] hover:text-[#ede5c4]" to="/forgot-password">
                Forgot password?
              </Link>
            </p>
            <p className="text-sm text-white/70">
              New here?{" "}
              <Link className="text-[#d9d2b0] hover:text-[#ede5c4]" to="/register">
                Create account
              </Link>
            </p>
          </form>
        )}

        {twoFactorToken && (
          <form onSubmit={handleTwoFactorSubmit} className="ui-card rounded-3xl p-6 md:p-8 space-y-4">
            <div>
              <p className="ui-kicker">Two-factor authentication</p>
              <h2 className="ui-title mt-1">Enter your code</h2>
              <p className="text-sm text-white/70 mt-2">
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
            {error && <p className="text-red-300 text-sm">{error}</p>}
            <button className="w-full p-3 ui-button-primary" disabled={submitting}>
              {submitting ? "Verifying..." : "Verify"}
            </button>
            <button
              type="button"
              className="text-sm text-white/70 hover:text-white"
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
      </div>
    </div>
  );
}
