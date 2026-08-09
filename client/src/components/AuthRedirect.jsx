import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AuthRedirect({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen page-gradient flex items-center justify-center text-white/70 text-sm">
        Loading your space...
      </div>
    );
  }
  if (user) return <Navigate to="/chat" replace />;
  return children;
}

