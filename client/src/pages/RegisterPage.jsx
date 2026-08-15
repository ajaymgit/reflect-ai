import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, describeError } from "../api";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { setToken, setUser } = useAuth();
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    // Previously had no loading/disabled state at all -- unlike every other
    // form in the app, a double-click here fired two register requests.
    setSubmitting(true);
    try {
      const data = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      setToken(data.token, data.refreshToken);
      setUser(data.user);
      navigate("/chat");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen page-gradient living-bg mood-calm text-white flex items-center justify-center p-4">
      <motion.div
        className="w-full max-w-5xl grid md:grid-cols-2 gap-4"
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <section className="ui-card rounded-2xl p-8 hidden md:flex flex-col justify-between">
          <div>
            <p className="ui-kicker">Equoria</p>
            <h1 className="ui-title mt-3">Create your reflective space</h1>
            <p className="text-white/70 mt-3 text-sm leading-6">
              Build a private journaling routine and chat with ReflectAI for contextual self-reflection.
            </p>
          </div>
          {/* Names the actual differentiated features (a quick tour follows
              right after signup -- see Onboarding.jsx) instead of generic
              "memory-aware reflection" bullet points that could describe
              almost any AI journaling app. */}
          <ul className="text-sm text-white/70 space-y-2">
            <li>• Keepsakes -- flag entries worth revisiting later</li>
            <li>• Time capsules -- seal a letter to your future self</li>
            <li>• Retrospect -- real patterns in your mood over time</li>
          </ul>
        </section>

        <form onSubmit={handleSubmit} className="ui-card rounded-2xl p-6 md:p-8 space-y-4">
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
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <PasswordInput
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-red-300 text-sm">{error}</p>}
          <button className="w-full p-3 ui-button-primary" disabled={submitting}>
            {submitting ? "Creating account..." : "Register"}
          </button>
          <p className="text-sm text-white/70">
            Already have an account?{" "}
            <Link className="text-[#d9d2b0] hover:text-[#ede5c4]" to="/login">
              Login
            </Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}

