import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import { Button, TextField } from "../ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { setToken, setUser } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      setUser(data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-screen page-gradient text-white flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-4">
        <section className="glass rounded-3xl p-8 hidden md:flex flex-col justify-between">
          <div>
            <p className="text-brand-100 text-sm">ReflectAI</p>
            <h1 className="text-3xl font-semibold mt-3">ReflectAI Coach</h1>
            <p className="text-white/70 mt-3 text-sm leading-6">
              A calm journaling workspace with memory-aware reflective conversations and evidence-based prompts.
            </p>
          </div>
          <div className="text-sm text-white/70">
            Demo: <span className="text-white">demo@reflectai.com / Demo@123</span>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="glass rounded-3xl p-6 md:p-8 space-y-4">
          <div>
            <p className="text-brand-100 text-sm">Welcome back</p>
            <h2 className="text-2xl font-semibold mt-1">Sign in to ReflectAI</h2>
          </div>
          <TextField
            id="login-email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="demo@reflectai.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            id="login-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-mood-coral text-sm" role="alert">{error}</p>}
          <Button className="w-full">
            Login
          </Button>
          <p className="text-sm text-white/70">
            New here?{" "}
            <Link className="text-brand-100 hover:text-brand-50" to="/register">
              Create account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

