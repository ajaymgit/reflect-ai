import { Component } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

// Root-level safety net -- nothing in this app previously caught a
// render-time error anywhere. React's default behavior when a component
// throws during render is to unmount the *entire* tree above it, so any
// null-reference bug in a single page component (a malformed API response,
// a stray undefined field) didn't just break that page -- it took the whole
// app to a blank white screen with literally nothing on it: no error
// message, no nav, no way back, not even a console hint visible to the
// person looking at it. That's a real gap for a journaling app specifically:
// someone hitting this mid-write has no way to tell whether their entry is
// still sitting in the composer, gone, or fine, and no recovery path except
// guessing to hit browser refresh.
//
// Deliberately a class component -- getDerivedStateFromError/componentDidCatch
// have no hook equivalent; this is the one place in the app that still needs
// one. Wrapped around the *entire* provider tree in main.jsx (outside
// BrowserRouter/AuthProvider, not just around <App />), so it also catches a
// hypothetical failure in a provider itself, not only inside routed pages --
// which is also why the fallback UI below uses a plain <a href> instead of
// react-router's <Link>: it can't assume Router context is still intact.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Logged, not swallowed -- this is the only place in the app a render
    // error like this would otherwise vanish with zero trace.
    console.error("Unhandled render error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen page-gradient flex items-center justify-center px-4">
        <div className="ui-card rounded-2xl p-6 w-full max-w-sm text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <AlertTriangle size={18} />
          </div>
          <h1 className="text-lg font-semibold font-display">Something went wrong</h1>
          <p className="text-sm text-ink/70 mt-2">
            Reflect hit an unexpected error. Your data is safe -- reloading usually fixes this.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ui-button-primary w-full mt-4 px-4 py-2.5 min-h-11 text-sm inline-flex items-center justify-center gap-1.5"
          >
            <RefreshCw size={14} />
            Reload
          </button>
          <a href="/dashboard" className="block mt-3 text-xs text-ink/50 hover:text-ink/80">
            Or go back to Home
          </a>
        </div>
      </div>
    );
  }
}
