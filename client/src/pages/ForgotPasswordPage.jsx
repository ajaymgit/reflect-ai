import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, describeError } from "../api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      // Backend deliberately returns the same generic message whether or
      // not the email has an account (avoids leaking which emails are
      // registered), so the UI always shows this same confirmation too.
      setStatus(data.message || "If an account exists for that email, a reset link has been sent.");
      setSubmitted(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen page-gradient living-bg mood-calm text-ink flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <form onSubmit={handleSubmit} className="ui-card rounded-2xl p-6 md:p-8 space-y-4">
          <div>
            <p className="ui-kicker">Reset password</p>
            <h2 className="ui-title mt-1">Forgot your password?</h2>
            <p className="text-sm text-ink/70 mt-2">
              Enter your account email and we'll send you a link to reset your password.
            </p>
          </div>
          {!submitted && (
            <>
              <input
                className="ui-input"
                placeholder="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && <p className="text-red-300 text-sm">{error}</p>}
              <button className="w-full p-3 ui-button-primary" disabled={submitting}>
                {submitting ? "Sending..." : "Send reset link"}
              </button>
            </>
          )}
          {submitted && <p className="text-sm text-ember-soft">{status}</p>}
          <p className="text-sm text-ink/70">
            <Link className="text-signal hover:text-signal-soft" to="/login">
              Back to login
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
