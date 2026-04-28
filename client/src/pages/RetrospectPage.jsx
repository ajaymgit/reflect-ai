import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "../api";
import { Button, MetricSkeleton, PageState } from "../ui";

export default function RetrospectPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    apiFetch("/api/retrospect/analysis")
      .then(setData)
      .catch((err) => setError(err.message || "Could not load retrospect analysis."))
      .finally(() => setLoading(false));
  }, []);

  const moodSeries = (data?.timeline || []).map((item) => ({
    date: new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    score: moodToScore(item.mood),
  }));

  return (
    <main className="p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="glass rounded-2xl p-5">
          <p className="text-brand-100 text-xs uppercase tracking-wider">Retrospect Analysis</p>
          <h2 className="text-2xl font-semibold mt-1">Pattern and behavior review</h2>
          <p className="text-sm text-white/70 mt-2">
            {loading ? "Analyzing entries..." : data?.emotionalPatternSummary || "No retrospect summary is available yet."}
          </p>
        </div>

        {error && (
          <PageState
            title="Retrospect could not load"
            message={error}
            action={<Button type="button" onClick={() => window.location.reload()}>Retry</Button>}
          />
        )}

        {loading && (
          <div className="grid md:grid-cols-3 gap-3">
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="glass rounded-2xl p-4 lg:col-span-2">
                <h3 className="font-medium">Emotional timeline</h3>
                <p className="text-xs text-white/60 mt-1">
                  Each bar shows the emotional intensity of that day (higher means more uplifting/steady tone).
                </p>
                {moodSeries.length ? (
                  <div className="h-64 mt-3" aria-label="Emotional timeline chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={moodSeries}>
                        <XAxis dataKey="date" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                        <YAxis
                          tick={{ fill: "#cbd5e1", fontSize: 12 }}
                          domain={[0, 5]}
                          tickFormatter={(v) => scoreToLabel(v)}
                        />
                        <Tooltip formatter={(value) => scoreToLabel(value)} />
                        <Bar dataKey="score" fill="#a4bd81" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <PageState title="No timeline yet" message="Add journal entries to build a pattern timeline." />
                )}
              </div>

              <div className="glass rounded-2xl p-4 space-y-3">
                <h3 className="font-medium">Recurring themes</h3>
                {(data?.recurringThemes || []).length ? (
                  (data?.recurringThemes || []).map((theme) => (
                    <div key={theme} className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm">
                      {theme.replace(/_/g, " ")}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-white/65">Themes appear after a few journal entries.</p>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Card title="Behavioral loops" body={(data?.behavioralLoops || []).join(" • ")} />
              <Card title="Health correlation" body={data?.healthCorrelation || "No correlation data yet."} />
            </div>

            <div className="glass rounded-2xl p-4">
              <p className="text-brand-100 text-xs uppercase tracking-wider">Socratic question</p>
              <p className="text-white/90 mt-2">{data?.socraticQuestion || "What pattern feels most meaningful to reflect on next?"}</p>
              <Button type="button" className="mt-4">
                Continue Reflection
              </Button>
            </div>
          </>
        )}
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
      <p className="text-brand-100 text-xs uppercase tracking-wider">{title}</p>
      <p className="text-sm text-white/80 mt-2">{body}</p>
    </div>
  );
}
