import { useEffect, useState } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "../api";

export default function HealthPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch("/api/health-data/overview")
      .then(setData)
      .catch(() => {});
  }, []);

  return (
    <main className="p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="glass rounded-2xl p-5">
          <p className="text-[#d9d2b0] text-xs uppercase tracking-wider">Health Dashboard</p>
          <h2 className="text-3xl font-semibold mt-1">Mind-body metrics</h2>
          <p className="text-base text-white/75 mt-2">
            Current status: <span className="font-medium text-white">{data?.status || "Loading..."}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Metric label="Steps" value={data?.latest?.steps ?? "--"} />
          <Metric label="Sleep (h)" value={data?.latest?.sleepHours ?? "--"} />
          <Metric label="Heart rate" value={data?.latest?.restingHeartRate ?? "--"} />
          <Metric label="Stress score" value={data?.latest?.stressScore ?? "--"} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <Metric label="Avg steps (month)" value={data?.averages?.monthly?.steps ?? "--"} />
          <Metric label="Avg sleep (month)" value={data?.averages?.monthly?.sleepHours ?? "--"} />
          <Metric label="Avg screen time (h)" value={data?.averages?.monthly?.screenTimeHours ?? "--"} />
          <Metric label="Avg calories" value={data?.averages?.monthly?.calories ?? "--"} />
          <Metric label="Health streak" value={data?.streakDays ? `${data.streakDays} days` : "--"} />
        </div>

        <div className="glass rounded-2xl p-4">
          <h3 className="font-medium">Weekly trend</h3>
          <div className="h-64 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.weekly || []}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  tick={{ fill: "#cbd5e1", fontSize: 12 }}
                />
                <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} />
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
                <Line type="monotone" dataKey="steps" stroke="#e8ab5f" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="stress" stroke="#da8b5b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="sleep" stroke="#8eb184" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-2xl p-4">
          <p className="text-[#d9d2b0] text-xs uppercase tracking-wider">Insight</p>
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
