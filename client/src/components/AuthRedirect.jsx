import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PageState } from "../ui";

export default function AuthRedirect({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <main className="min-h-screen page-gradient p-4 text-white">
        <div className="mx-auto max-w-md pt-20">
          <PageState title="Checking your session" message="Preparing your ReflectAI workspace..." />
        </div>
      </main>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

