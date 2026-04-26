import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "../api";

export default function RetrospectPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch("/api/retrospect/analysis")
      .then(setData)
      .catch(() => {});
  }, []);

  const moodSeries = (data?.timeline || []).map((item) => ({
    date: new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    score: moodToScore(item.mood),
  }));

  return (
    <main className="p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="glass rounded-2xl p-5">
          <p className="text-cyan-300 text-xs uppercase tracking-wider">Retrospect Analysis</p>
          <h2 className="text-2xl font-semibold mt-1">Pattern and behavior review</h2>
          <p className="text-sm text-white/70 mt-2">{data?.emotionalPatternSummary || "Analyzing entries..."}</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="glass rounded-2xl p-4 lg:col-span-2">
            <h3 className="font-medium">Emotional timeline</h3>
            <p className="text-xs text-white/60 mt-1">
              Each bar shows the emotional intensity of that day (higher means more uplifting/steady tone).
            </p>
            <div className="h-64 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={moodSeries}>
                  <XAxis dataKey="date" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: "#cbd5e1", fontSize: 12 }}
                    domain={[0, 5]}
                    tickFormatter={(v) => scoreToLabel(v)}
                  />
                  <Tooltip formatter={(value) => scoreToLabel(value)} />
                  <Bar dataKey="score" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 space-y-3">
            <h3 className="font-medium">Recurring themes</h3>
            {(data?.recurringThemes || []).map((theme) => (
              <div key={theme} className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm">
                {theme.replace(/_/g, " ")}
              </div>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card title="Behavioral loops" body={(data?.behavioralLoops || []).join(" • ")} />
          <Card title="Health correlation" body={data?.healthCorrelation || "No correlation data yet."} />
        </div>

        <div className="glass rounded-2xl p-4">
          <p className="text-cyan-300 text-xs uppercase tracking-wider">Socratic question</p>
          <p className="text-white/90 mt-2">{data?.socraticQuestion || "What pattern feels most meaningful to reflect on next?"}</p>
          <button className="mt-4 rounded-xl px-4 py-2 bg-violet-500 hover:bg-violet-400">
            Continue Reflection
          </button>
        </div>
      </div>
    </main>
  );
}

function moodToScore(mood) {
  const map = { happy: 5, calm: 4, reflective: 3, sad: 2, stressed: 1, angry: 0 };
  return map[mood] ?? 3;
}

function scoreToLabel(score) {
  const rounded = Math.round(Number(score));
  const label = {
    5: "Very Positive",
    4: "Calm/Positive",
    3: "Reflective",
    2: "Low Mood",
    1: "Stressed",
    0: "Intense",
  }[rounded];
  return label || "Reflective";
}

function Card({ title, body }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-cyan-300 text-xs uppercase tracking-wider">{title}</p>
      <p className="text-sm text-white/80 mt-2">{body}</p>
    </div>
  );
}
