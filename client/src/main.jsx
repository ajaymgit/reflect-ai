import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Outermost, wrapping the router and every provider -- not just <App />
        -- so a render error anywhere in the tree (including a provider
        itself) shows a real fallback screen instead of unmounting to blank
        white. See ErrorBoundary.jsx. */}
    <ErrorBoundary>
      {/* v7_startTransition/v7_relativeSplatPath: opt in early to the React
          Router v7 behaviors these flags gate (state updates wrapped in
          React.startTransition, and relative-path resolution inside splat
          routes) -- react-router-dom logs a console warning on every page
          load until one or the other happens, and this app has nothing that
          depends on the pre-v7 behavior (the one splat route, App.jsx's
          catch-all 404, has no nested relative links inside it). Silences the
          warning now and is most of the actual migration work whenever this
          app upgrades to v7 itself. */}
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);

