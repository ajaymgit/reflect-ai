import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useAppLock from "../hooks/useAppLock";
import AppLockScreen from "./AppLockScreen";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  // Hooks can't be called conditionally, so useAppLock always runs -- it
  // no-ops safely when user is undefined (loading) or null (logged out),
  // see the !userId guard inside the hook.
  const appLock = useAppLock(user?.id);

  if (loading) {
    return (
      <div className="min-h-screen page-gradient flex items-center justify-center text-ink/70 text-sm">
        Loading your space...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // Sits between the real auth check above and the app itself -- a
  // convenience deterrent layered on top of the JWT boundary, not a
  // replacement for it. Renders in place of the route entirely (rather than
  // as an overlay), so the locked page's data never mounts into the DOM.
  if (appLock.isEnabled && !appLock.isUnlocked) {
    return <AppLockScreen onUnlock={appLock.tryUnlock} />;
  }
  return children;
}

