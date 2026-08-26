import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import AuthRedirect from "./components/AuthRedirect";
import ProtectedRoute from "./components/ProtectedRoute";
import { applyStoredTheme } from "./utils/theme";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const JournalPage = lazy(() => import("./pages/JournalPage"));
const YearInReviewPage = lazy(() => import("./pages/YearInReviewPage"));
const RetrospectPage = lazy(() => import("./pages/RetrospectPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const HealthPage = lazy(() => import("./pages/HealthPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const MorePage = lazy(() => import("./pages/MorePage"));

export default function App() {
  // AppShell (and SettingsPage's own toggle) apply body[data-theme-mode] --
  // but AppShell only mounts inside the authenticated "/" route tree, so any
  // page outside it (this file's own /login, /privacy, /terms, and the
  // catch-all 404 below) never gets that effect and falls back to index.css's
  // default light "daylight" styling. Barely noticeable pre-login, but jarring
  // for the 404 page specifically: it's reachable by an already-authenticated,
  // already-dark-themed user who mistypes an in-app URL (e.g. "/journal"
  // instead of "/journal/new") or loads a stale link, and it explicitly
  // offers them a "Back to Home" action -- so it reads as part of the app,
  // not a public marketing page, and should match whatever theme they had.
  // Applying the saved preference once here, before any route renders, means
  // every page (including this 404) starts themed correctly instead of only
  // the ones nested under AppShell.
  useEffect(() => {
    applyStoredTheme();
  }, []);

  const routeFallback = (
    <div className="min-h-[40vh] flex items-center justify-center text-ink/70 text-sm">
      Loading your space...
    </div>
  );

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <AuthRedirect>
            <Suspense fallback={routeFallback}>
              <LoginPage />
            </Suspense>
          </AuthRedirect>
        }
      />
      <Route
        path="/register"
        element={
          <AuthRedirect>
            <Suspense fallback={routeFallback}>
              <RegisterPage />
            </Suspense>
          </AuthRedirect>
        }
      />
      {/* Deliberately NOT wrapped in AuthRedirect, unlike /login and
          /register: someone can be logged in on this browser (or another
          device) and still need to reset a forgotten password -- gating
          this behind "not already authenticated" would strand them. */}
      <Route
        path="/forgot-password"
        element={
          <Suspense fallback={routeFallback}>
            <ForgotPasswordPage />
          </Suspense>
        }
      />
      <Route
        path="/reset-password"
        element={
          <Suspense fallback={routeFallback}>
            <ResetPasswordPage />
          </Suspense>
        }
      />
      {/* Public, unauthenticated -- linked from Register and Settings.
          Reachable whether or not you have an account, same as any real
          site's legal pages. */}
      <Route
        path="/privacy"
        element={
          <Suspense fallback={routeFallback}>
            <PrivacyPolicyPage />
          </Suspense>
        }
      />
      <Route
        path="/terms"
        element={
          <Suspense fallback={routeFallback}>
            <TermsPage />
          </Suspense>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route
          path="dashboard"
          element={
            <Suspense fallback={routeFallback}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route
          path="journal/new"
          element={
            <Suspense fallback={routeFallback}>
              <JournalPage />
            </Suspense>
          }
        />
        {/* Journal History is no longer its own page -- it's the "History"
            tab inside JournalPage now (see JournalPage.jsx). This route just
            redirects so old links/bookmarks to /journal/history still land
            somewhere sensible instead of 404-ing. */}
        <Route path="journal/history" element={<Navigate to="/journal/new?view=history" replace />} />
        <Route
          path="year-in-review"
          element={
            <Suspense fallback={routeFallback}>
              <YearInReviewPage />
            </Suspense>
          }
        />
        <Route
          path="retrospect"
          element={
            <Suspense fallback={routeFallback}>
              <RetrospectPage />
            </Suspense>
          }
        />
        <Route
          path="chat"
          element={
            <Suspense fallback={routeFallback}>
              <ChatPage />
            </Suspense>
          }
        />
        <Route
          path="health"
          element={
            <Suspense fallback={routeFallback}>
              <HealthPage />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={routeFallback}>
              <SettingsPage />
            </Suspense>
          }
        />
        {/* Mobile-only overflow menu -- see AppShell.jsx / MorePage.jsx */}
        <Route
          path="more"
          element={
            <Suspense fallback={routeFallback}>
              <MorePage />
            </Suspense>
          }
        />
        <Route index element={<Navigate to="/dashboard" replace />} />
      </Route>
      {/* A real 404 instead of a silent redirect -- see NotFoundPage.jsx for
          why that matters (an old bookmark or typo'd link used to just land
          you somewhere else with zero explanation). */}
      <Route
        path="*"
        element={
          <Suspense fallback={routeFallback}>
            <NotFoundPage />
          </Suspense>
        }
      />
    </Routes>
  );
}

