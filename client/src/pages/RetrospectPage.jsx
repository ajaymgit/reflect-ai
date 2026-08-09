import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { isoDay } from "../utils/date";
import DayEntryPreview from "../components/DayEntryPreview";

export default function RetrospectPage() {
  const [data, setData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch("/api/retrospect/analysis")
      .then(setData)
      .catch(() => {});
  }, []);

  const moodSeries = (data?.timeline || []).map((item) => ({
    date: new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    rawDate: isoDay(new Date(item.date)),
    score: moodToScore(item.mood),
  }));

  return (
    <main className="ui-page">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="ui-card rounded-2xl p-5">
          <p className="ui-kicker">Retrospect Analysis</p>
          <h2 className="ui-title mt-1">Pattern and behavior review</h2>
          <p className="text-sm text-white/70 mt-2">{data?.emotionalPatternSummary || "Analyzing entries..."}</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="ui-card rounded-2xl p-4 lg:col-span-2">
            <h3 className="font-medium">Emotional timeline</h3>
            <p className="text-xs text-white/60 mt-1">
              Each bar shows the emotional intensity of that day (higher means more uplifting/steady tone). Click a bar
              to see what you wrote that day.
            </p>
            <div className="h-64 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={moodSeries}>
                  <XAxis dataKey="date" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: "#cbd5e1", fontSize: 12 }}
                    domain={[0, 5]}
                    tickFormatter={(v) => scoreToLabel(v)}
                    width={72}
                  />
                  <Tooltip formatter={(value) => scoreToLabel(value)} />
                  {/* Was a bright purple (#8b5cf6) that didn't appear
                      anywhere else in the app's palette -- every other chart
                      (Health page) and every accent color (buttons, active
                      nav state) uses this same warm olive-green. Now also
                      clickable -- there was no way to go from "this day
                      looked rough" to actually reading that day's entry. */}
                  <Bar
                    dataKey="score"
                    fill="#8fae73"
                    radius={[8, 8, 0, 0]}
                    cursor="pointer"
                    onClick={(point) => setSelectedDate(point?.payload?.rawDate || point?.rawDate || null)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <DayEntryPreview date={selectedDate} />
          </div>

          <div className="ui-card rounded-2xl p-4 space-y-3">
            <h3 className="font-medium">Recurring themes</h3>
            {(data?.recurringThemes || []).map((theme) => (
              <div key={theme} className="surface px-3 py-2 text-sm">
                {theme.replace(/_/g, " ")}
              </div>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card title="Behavioral loops" body={(data?.behavioralLoops || []).join(" • ")} />
          <Card title="Health correlation" body={data?.healthCorrelation || "No correlation data yet."} />
        </div>

        <div className="ui-card rounded-2xl p-4">
          <p className="ui-kicker">Socratic question</p>
          <p className="text-white/90 mt-2">{data?.socraticQuestion || "What pattern feels most meaningful to reflect on next?"}</p>
          <button
            type="button"
            className="mt-4 px-4 py-2 ui-button-primary"
            onClick={() => navigate("/chat", { state: { prefill: data?.socraticQuestion } })}
          >
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
  // "Calm/Positive" (no space around the slash) was the one label recharts'
  // default Y-axis tick couldn't word-wrap onto two lines the way it does
  // for the others -- it rendered as one long line, overflowed the axis's
  // default width, and got clipped down to "n/Positive". A space either
  // side gives it the same wrap point as "Very Positive"/"Low Mood".
  const label = {
    5: "Very Positive",
    4: "Calm / Positive",
    3: "Reflective",
    2: "Low Mood",
    1: "Stressed",
    0: "Intense",
  }[rounded];
  return label || "Reflective";
}

function Card({ title, body }) {
  return (
    <div className="ui-card rounded-2xl p-4">
      <p className="ui-kicker">{title}</p>
      <p className="text-sm text-white/80 mt-2">{body}</p>
    </div>
  );
}
