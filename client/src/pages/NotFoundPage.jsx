import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Previously any unmatched URL silently redirected to /dashboard (or
// /login, via ProtectedRoute, if logged out) with no explanation -- a typo'd
// link or an old bookmark to a page that got renamed (journal/history did,
// see App.jsx) just... went somewhere else, with nothing telling you that's
// what happened. A real 404 says so honestly instead of pretending the URL
// was fine.
export default function NotFoundPage() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen page-gradient flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <p className="ui-kicker">404</p>
        <h1 className="ui-title mt-2">This page doesn't exist</h1>
        <p className="text-sm text-ink/70 mt-3">
          The link might be old, or the address was typed wrong. Nothing's broken on your account.
        </p>
        <Link to={user ? "/dashboard" : "/login"} className="inline-flex mt-6 px-5 py-2.5 min-h-11 ui-button-primary">
          {user ? "Back to Home" : "Back to login"}
        </Link>
      </div>
    </div>
  );
}
