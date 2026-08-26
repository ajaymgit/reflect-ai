import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch, describeError } from "../api";
import PasswordInput from "../components/PasswordInput";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen page-gradient living-bg mood-calm text-ink flex items-center justify-center p-4">
        <div className="w-full max-w-md ui-card rounded-3xl p-6 md:p-8 space-y-4">
          <p className="ui-kicker">Reset password</p>
          <h2 className="ui-title mt-1">Missing reset link</h2>
          <p className="text-sm text-ink/70">
            This page needs a reset token from the link in your email.
          </p>
          <Link className="text-signal hover:text-signal-soft text-sm" to="/forgot-password">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-gradient living-bg mood-calm text-ink flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <form onSubmit={handleSubmit} className="ui-card rounded-3xl p-6 md:p-8 space-y-4">
          <div>
            <p className="ui-kicker">Reset password</p>
            <h2 className="ui-title mt-1">Choose a new password</h2>
          </div>
          {!done && (
            <>
              <PasswordInput
                placeholder="New password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <PasswordInput
                placeholder="Confirm new password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {error && <p className="text-red-300 text-sm">{error}</p>}
              <button className="w-full p-3 ui-button-primary" disabled={submitting}>
                {submitting ? "Updating..." : "Update password"}
              </button>
            </>
          )}
          {done && (
            <div className="space-y-3">
              <p className="text-sm text-ember-soft">
                Your password has been updated. You've been signed out everywhere for security -- please log in
                again with your new password.
              </p>
              <button type="button" className="w-full p-3 ui-button-primary" onClick={() => navigate("/login")}>
                Go to login
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
