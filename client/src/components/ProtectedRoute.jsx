import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PageState } from "../ui";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <main className="min-h-screen page-gradient p-6 text-white">
        <PageState title="Opening ReflectAI" message="Checking your session..." />
      </main>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

