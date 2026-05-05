import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { setToken, setUser } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      setToken(data.token);
      setUser(data.user);
      navigate("/chat");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-screen page-gradient text-white flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-4">
        <section className="ui-card rounded-3xl p-8 hidden md:flex flex-col justify-between">
          <div>
            <p className="ui-kicker">Equoria</p>
            <h1 className="ui-title mt-3">Create your reflective space</h1>
            <p className="text-white/70 mt-3 text-sm leading-6">
              Build a private journaling routine and chat with ReflectAI for contextual self-reflection.
            </p>
          </div>
          <ul className="text-sm text-white/70 space-y-2">
            <li>• Memory-aware reflection</li>
            <li>• Evidence-linked prompts</li>
            <li>• Calm, focused chat experience</li>
          </ul>
        </section>

        <form onSubmit={handleSubmit} className="ui-card rounded-3xl p-6 md:p-8 space-y-4">
          <div>
            <p className="ui-kicker">Get started</p>
            <h2 className="ui-title mt-1">Create Equoria account</h2>
          </div>
          <input
            className="ui-input"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="ui-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            className="ui-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-red-300 text-sm">{error}</p>}
          <button className="w-full p-3 ui-button-primary">
            Register
          </button>
          <p className="text-sm text-white/70">
            Already have an account?{" "}
            <Link className="text-[#d9d2b0] hover:text-[#ede5c4]" to="/login">
              Login
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

