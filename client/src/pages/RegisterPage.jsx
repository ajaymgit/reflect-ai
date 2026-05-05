import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import { Button, TextField } from "../ui";

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
      const normalizedEmail = email.trim().toLowerCase();
      const data = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), email: normalizedEmail, password }),
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
            <h1 className="text-3xl font-semibold mt-3">Create your reflective space</h1>
            <p className="text-[#5a3d2c] mt-3 text-sm leading-6">
              Build a private journaling routine and chat with ReflectAI for contextual self-reflection.
            </p>
          </div>
          <ul className="text-sm text-[#5a3d2c] space-y-2">
            <li>• Memory-aware reflection</li>
            <li>• Evidence-linked prompts</li>
            <li>• Calm, focused chat experience</li>
          </ul>
        </section>

        <form onSubmit={handleSubmit} className="glass rounded-3xl p-5 sm:p-6 md:p-8 space-y-4">
          <div>
            <p className="text-brand-100 text-sm">Get started</p>
            <h2 className="text-2xl font-semibold mt-1">Create ReflectAI account</h2>
          </div>
          <TextField
            id="register-name"
            label="Name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            id="register-email"
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            id="register-password"
            label="Password"
            type="password"
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-mood-angry text-sm" role="alert">{error}</p>}
          <Button className="w-full">
            Register
          </Button>
          <p className="text-sm text-[#5a3d2c]">
            Already have an account?{" "}
            <Link className="text-brand-100 hover:text-brand-50" to="/login">
              Login
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

