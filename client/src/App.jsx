import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import AuthRedirect from "./components/AuthRedirect";
import ProtectedRoute from "./components/ProtectedRoute";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const JournalPage = lazy(() => import("./pages/JournalPage"));
const RetrospectPage = lazy(() => import("./pages/RetrospectPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const HealthPage = lazy(() => import("./pages/HealthPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

export default function App() {
  const routeFallback = (
    <div className="min-h-[40vh] flex items-center justify-center text-white/70 text-sm">
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
        <Route index element={<Navigate to="/dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

