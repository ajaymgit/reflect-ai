import { useCallback, useEffect, useState } from "react";

function storageKeyFor(userId) {
  return `equoria-applock-${userId}`;
}

function unlockedKeyFor(userId) {
  return `equoria-applock-unlocked-${userId}`;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPin(pin, saltHex) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${saltHex}:${pin}`));
  return toHex(digest);
}

// Client-only app lock -- a quick-glance PIN gate layered on top of the real
// JWT/account-password security boundary, not a replacement for it. Anyone
// with script execution on this device already has full localStorage/
// sessionStorage read access, so this can't stop a determined attacker; what
// it does stop is someone picking up an unlocked phone/laptop and scrolling
// through a private journal. The salted SHA-256 hash lives in localStorage
// (survives closing the tab -- "I set a PIN once" shouldn't mean re-setting
// it every session); the "already unlocked" flag lives in sessionStorage
// instead, so a full tab close always re-locks on next open even though the
// PIN itself persists. Scoped per user id, same pattern as the
// onboarding-seen flag in AppShell.jsx, so a shared device with multiple
// accounts doesn't leak one person's lock state into another's.
export default function useAppLock(userId) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsEnabled(false);
      setIsUnlocked(true);
      return;
    }
    try {
      const stored = localStorage.getItem(storageKeyFor(userId));
      const enabled = !!stored;
      setIsEnabled(enabled);
      setIsUnlocked(!enabled || sessionStorage.getItem(unlockedKeyFor(userId)) === "1");
    } catch {
      // Storage inaccessible (private-browsing lockdown, etc.) -- fail open
      // rather than locking someone out of their own journal with no way in.
      setIsEnabled(false);
      setIsUnlocked(true);
    }
  }, [userId]);

  const setPin = useCallback(
    async (pin) => {
      if (!userId) return;
      const saltHex = toHex(crypto.getRandomValues(new Uint8Array(16)));
      const hashHex = await hashPin(pin, saltHex);
      localStorage.setItem(storageKeyFor(userId), JSON.stringify({ saltHex, hashHex }));
      // Setting/changing a PIN happens from inside the already-unlocked app --
      // don't immediately re-lock the person out of the page they're on.
      sessionStorage.setItem(unlockedKeyFor(userId), "1");
      setIsEnabled(true);
      setIsUnlocked(true);
    },
    [userId]
  );

  const disable = useCallback(() => {
    if (!userId) return;
    localStorage.removeItem(storageKeyFor(userId));
    sessionStorage.removeItem(unlockedKeyFor(userId));
    setIsEnabled(false);
    setIsUnlocked(true);
  }, [userId]);

  const tryUnlock = useCallback(
    async (pin) => {
      if (!userId) return false;
      let record = null;
      try {
        record = JSON.parse(localStorage.getItem(storageKeyFor(userId)) || "null");
      } catch {
        record = null;
      }
      if (!record?.saltHex || !record?.hashHex) return false;
      const candidate = await hashPin(pin, record.saltHex);
      const ok = candidate === record.hashHex;
      if (ok) {
        sessionStorage.setItem(unlockedKeyFor(userId), "1");
        setIsUnlocked(true);
      }
      return ok;
    },
    [userId]
  );

  const lockNow = useCallback(() => {
    if (!userId) return;
    sessionStorage.removeItem(unlockedKeyFor(userId));
    setIsUnlocked(false);
  }, [userId]);

  return { isEnabled, isUnlocked, setPin, disable, tryUnlock, lockNow };
}
