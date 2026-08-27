import { useState } from "react";
import { Lock, LogOut } from "lucide-react";
import PinInput from "./PinInput";
import { useAuth } from "../context/AuthContext";

// Full-page gate, not a dismissible modal -- there's no backdrop click or
// Escape key that should ever close this. ProtectedRoute renders this in
// place of the requested route whenever useAppLock reports
// enabled-but-not-unlocked, so the underlying page never mounts at all --
// nothing sensitive is sitting in the DOM behind an overlay waiting to leak
// through a devtools inspect or a slow paint.
export default function AppLockScreen({ onUnlock }) {
  const { logout } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy || !pin) return;
    setBusy(true);
    setError("");
    const ok = await onUnlock(pin);
    if (!ok) {
      setError("Incorrect PIN.");
      setPin("");
    }
    setBusy(false);
  }

  return (
    <div className="min-h-screen page-gradient flex items-center justify-center px-4">
      <div className="ui-card rounded-2xl p-6 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={18} className="text-ink-faint" />
          <h1 className="text-lg font-semibold font-display">Enter your PIN</h1>
        </div>
        <p className="text-xs text-ink/60 mb-4">Reflect is locked. Enter your PIN to continue.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <PinInput
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            autoFocus
            required
          />
          {error && (
            <p role="alert" className="text-xs text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !pin}
            className="ui-button-primary w-full px-4 py-2.5 min-h-11 text-sm disabled:opacity-60"
          >
            {busy ? "Checking..." : "Unlock"}
          </button>
        </form>
        <button
          type="button"
          onClick={logout}
          className="mt-4 flex items-center gap-1.5 text-xs text-ink/50 hover:text-ink/80 mx-auto"
        >
          <LogOut size={12} />
          Log out instead
        </button>
      </div>
    </div>
  );
}
