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
      const normalizedEmail = email.trim().toLowerCase();
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      setToken(data.token);
      setUser(data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-screen page-gradient text-[#4a3a31] flex items-center justify-center p-4 sm:p-5">
      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-4">
        <section className="glass rounded-3xl p-8 hidden md:flex flex-col justify-between">
          <div>
            <p className="text-brand-100 text-sm">ReflectAI</p>
            <h1 className="text-3xl font-semibold mt-3">ReflectAI Coach</h1>
            <p className="text-[#7e6454] mt-3 text-sm leading-6">
              A calm journaling workspace with memory-aware reflective conversations and evidence-based prompts.
            </p>
          </div>
          <div className="text-sm text-[#7e6454]">
            Demo: <span className="text-[#4a3a31]">demo@reflectai.com / Demo@123</span>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="glass rounded-3xl p-5 sm:p-6 md:p-8 space-y-4">
          <div>
            <p className="text-brand-100 text-sm">Welcome back</p>
            <h2 className="text-2xl font-semibold mt-1">Sign in to ReflectAI</h2>
            <p className="mt-1 text-xs text-[#7e6454] md:hidden">Demo: demo@reflectai.com / Demo@123</p>
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
          {error && <p className="text-[#9f693f] text-sm" role="alert">{error}</p>}
          <button
            type="button"
            onClick={() => {
              setEmail("demo@reflectai.com");
              setPassword("Demo@123");
            }}
            className="w-full min-h-[44px] rounded-[18px] border border-[#dbc2b2] bg-surface-100 text-[#7e6454] text-sm hover:bg-surface-200"
          >
            Use demo login
          </button>
          <Button className="w-full">
            Login
          </Button>
          <p className="text-sm text-[#7e6454]">
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

