import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState("demo@reflectai.com");
  const [password, setPassword] = useState("Demo@123");
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
      navigate("/chat");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-screen page-gradient text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute left-8 top-10 hidden h-24 w-24 rounded-full border border-white/10 bg-white/5 blur-[1px] md:block" />
      <div className="absolute bottom-10 right-10 hidden h-36 w-36 rounded-full border border-[#d9d2b0]/20 bg-[#8fae73]/10 md:block" />
      <div className="w-full max-w-5xl grid md:grid-cols-[1.05fr_0.95fr] gap-4 relative z-10">
        <section className="glass rounded-[2rem] p-8 hidden md:flex flex-col justify-between min-h-[540px]">
          <div>
            <p className="text-[#d9d2b0] text-sm uppercase tracking-[0.35em]">Equoria</p>
            <h1 className="text-5xl font-semibold mt-5 leading-tight">ReflectAI Coach</h1>
            <p className="text-white/72 mt-5 text-base leading-7 max-w-md">
              A calm journaling workspace with memory-aware reflective conversations and evidence-based prompts.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {["Journal", "Reflect", "Balance"].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center">
                  <p className="text-sm font-medium">{item}</p>
                  <p className="mt-1 text-[11px] text-white/55">guided</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[#d9d2b0]/20 bg-[#d9d2b0]/10 p-4 text-sm text-white/75">
            Demo access: <span className="text-white">demo@reflectai.com / Demo@123</span>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="glass rounded-[2rem] p-6 md:p-8 space-y-5">
          <div>
            <p className="text-[#d9d2b0] text-sm uppercase tracking-[0.22em]">Welcome back</p>
            <h2 className="text-3xl font-semibold mt-2">Sign in to Equoria</h2>
            <p className="mt-2 text-sm text-white/60">Pick up your reflection exactly where you left it.</p>
          </div>
          <input
            className="w-full rounded-2xl bg-[#101a16]/80 p-4 border border-white/10 outline-none focus:border-[#d9d2b0]/70 focus:ring-2 focus:ring-[#d9d2b0]/15 transition"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            className="w-full rounded-2xl bg-[#101a16]/80 p-4 border border-white/10 outline-none focus:border-[#d9d2b0]/70 focus:ring-2 focus:ring-[#d9d2b0]/15 transition"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-red-300 text-sm">{error}</p>}
          <button className="w-full rounded-2xl p-4 bg-[#d9d2b0] hover:bg-[#ebe2bd] transition font-semibold text-[#172018] shadow-[0_18px_40px_rgba(217,210,176,0.18)]">
            Login
          </button>
          <p className="text-sm text-white/70">
            New here?{" "}
            <Link className="text-[#d9d2b0] hover:text-[#f1e7bf]" to="/register">
              Create account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

