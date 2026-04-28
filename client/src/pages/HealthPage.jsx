import { useEffect, useState } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "../api";
import { MetricSkeleton, PageState } from "../ui";

export default function HealthPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    apiFetch("/api/health-data/overview")
      .then(setData)
      .catch((err) => setError(err.message || "Health data could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const hasWeeklyData = (data?.weekly || []).length > 0;

  return (
    <main className="p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="glass rounded-2xl p-5">
          <p className="text-brand-100 text-xs uppercase tracking-wider">Health Dashboard</p>
          <h2 className="text-3xl font-semibold mt-1">Mind-body metrics</h2>
          <p className="text-base text-white/75 mt-2">
            Current status: <span className="font-medium text-white">{loading ? "Loading..." : data?.status || "No data yet"}</span>
          </p>
        </div>

        {error ? <PageState title="Health data unavailable" message={error} /> : null}

        <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => <MetricSkeleton key={index} />)
          ) : (
            <>
              <Metric label="Steps" value={data?.latest?.steps ?? "--"} />
              <Metric label="Sleep (h)" value={data?.latest?.sleepHours ?? "--"} />
              <Metric label="Heart rate" value={data?.latest?.restingHeartRate ?? "--"} />
              <Metric label="Stress score" value={data?.latest?.stressScore ?? "--"} />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, index) => <MetricSkeleton key={index} />)
          ) : (
            <>
              <Metric label="Avg steps (month)" value={data?.averages?.monthly?.steps ?? "--"} />
              <Metric label="Avg sleep (month)" value={data?.averages?.monthly?.sleepHours ?? "--"} />
              <Metric label="Avg screen time (h)" value={data?.averages?.monthly?.screenTimeHours ?? "--"} />
              <Metric label="Avg calories" value={data?.averages?.monthly?.calories ?? "--"} />
              <Metric label="Health streak" value={data?.streakDays ? `${data.streakDays} days` : "--"} />
            </>
          )}
        </div>

        <div className="glass rounded-2xl p-4">
          <h3 className="font-medium">Weekly trend</h3>
          <p className="mt-1 text-xs text-white/60">
            Steps use the left axis. Sleep and stress use their own scale on the right.
          </p>
          <div className="h-64 mt-3">
            {hasWeeklyData ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.weekly}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    tick={{ fill: "#cbd5e1", fontSize: 12 }}
                  />
                  <YAxis yAxisId="steps" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <YAxis yAxisId="wellbeing" orientation="right" domain={[0, 100]} tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <Tooltip
                    formatter={(value, key) => {
                      if (key === "steps") return [`${value} steps`, "Daily movement"];
                      if (key === "stress") return [`${value} / 100`, "Stress level"];
                      if (key === "sleep") return [`${value} hours`, "Sleep"];
                      return [value, key];
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value) => {
                      if (value === "steps") return "Steps";
                      if (value === "stress") return "Stress";
                      if (value === "sleep") return "Sleep";
                      return value;
                    }}
                  />
                  <Line yAxisId="steps" type="monotone" dataKey="steps" stroke="#d9a15f" strokeWidth={2} dot={false} />
                  <Line yAxisId="wellbeing" type="monotone" dataKey="stress" stroke="#c77959" strokeWidth={2} dot={false} />
                  <Line yAxisId="wellbeing" type="monotone" dataKey="sleep" stroke="#a9c78e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <PageState title="No trend yet" message="Add health records to see sleep, movement, and stress trends here." />
            )}
          </div>
        </div>

        <div className="glass rounded-2xl p-4">
          <p className="text-brand-100 text-xs uppercase tracking-wider">Insight</p>
          <p className="text-sm text-white/80 mt-2">{data?.insight || "No health insight available yet."}</p>
          <p className="text-xs text-white/60 mt-2">
            Weekly avg stress: {data?.averages?.weekly?.stressScore ?? "--"} | Weekly avg sleep:{" "}
            {data?.averages?.weekly?.sleepHours ?? "--"}h
          </p>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-sm text-white/70">{label}</p>
      <p className="text-3xl font-semibold mt-2">{value}</p>
    </div>
  );
}
