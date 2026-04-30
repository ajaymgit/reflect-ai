import { useEffect, useState } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "../api";
import { Button, MetricSkeleton, PageState } from "../ui";
import {
  checkHealthKitAvailable,
  fetchHealthKitDailySummary,
  isNativeIos,
  requestHealthKitPermissions,
} from "../services/healthkit";

export default function HealthPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [healthKitStatus, setHealthKitStatus] = useState("");
  const [healthKitBusy, setHealthKitBusy] = useState(false);
  const [healthKitSummary, setHealthKitSummary] = useState(null);
  const nativeIos = isNativeIos();

  useEffect(() => {
    setLoading(true);
    setError("");
    apiFetch("/api/health-data/overview")
      .then(setData)
      .catch((err) => setError(err.message || "Health data could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  async function connectHealthKit() {
    setHealthKitBusy(true);
    setHealthKitStatus("");
    try {
      const available = await checkHealthKitAvailable();
      if (!available) {
        setHealthKitStatus("Apple Health is not available on this device.");
        return;
      }
      await requestHealthKitPermissions();
      const summary = await fetchHealthKitDailySummary();
      setHealthKitSummary(summary);
      setHealthKitStatus("Apple Health is connected.");
    } catch (err) {
      setHealthKitStatus(err?.message || "Could not connect Apple Health.");
    } finally {
      setHealthKitBusy(false);
    }
  }

  const hasWeeklyData = (data?.weekly || []).length > 0;
  const sections = [
    { id: "health-overview", label: "Overview" },
    { id: "health-latest", label: "Latest" },
    { id: "health-trend", label: "Weekly trend" },
    { id: "health-insight", label: "Insight" },
  ];
  function jumpTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="glass rounded-2xl p-3">
          <p className="text-[11px] uppercase tracking-wider text-white/65">Jump to section</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => jumpTo(section.id)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>
        <div id="health-overview" className="glass rounded-2xl p-5">
          <p className="text-brand-100 text-xs uppercase tracking-wider">Body Check</p>
          <h2 className="text-3xl font-semibold mt-1">Your daily health view</h2>
          <p className="text-base text-white/75 mt-2">
            Current status: <span className="font-medium text-white">{loading ? "Loading..." : data?.status || "No data yet"}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {nativeIos ? (
              <Button
                type="button"
                variant="secondary"
                onClick={connectHealthKit}
                disabled={healthKitBusy}
                className="w-full sm:w-auto"
              >
                {healthKitBusy ? "Connecting..." : "Connect Apple Health"}
              </Button>
            ) : (
              <Button type="button" variant="secondary" disabled className="w-full sm:w-auto opacity-70">
                Apple Health (iPhone app only)
              </Button>
            )}
            <p className="text-xs text-white/65">
              {nativeIos
                ? "On iPhone, this asks Health permissions and reads recent trends."
                : "Apple Health works only in the iPhone app build."}
            </p>
          </div>
          {healthKitStatus ? <p className="mt-2 text-xs text-brand-100">{healthKitStatus}</p> : null}
          {healthKitSummary ? (
            <p className="mt-1 text-xs text-white/70">
              Last 7 days imported: steps {healthKitSummary.steps.length}, sleep {healthKitSummary.sleep.length}, heart rate{" "}
              {healthKitSummary.heartRate.length}.
            </p>
          ) : null}
        </div>

        {error ? <PageState title="Health data unavailable" message={error} /> : null}

        <div id="health-latest" className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => <MetricSkeleton key={index} />)
          ) : (
            <>
              <Metric label="Steps" value={data?.latest?.steps ?? "--"} />
              <Metric label="Sleep (h)" value={data?.latest?.sleepHours ?? "--"} />
              <Metric label="Heart rate" value={data?.latest?.restingHeartRate ?? "--"} />
              <Metric label="Stress level" value={data?.latest?.stressScore ?? "--"} />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, index) => <MetricSkeleton key={index} />)
          ) : (
            <>
              <Metric label="Average steps (month)" value={data?.averages?.monthly?.steps ?? "--"} />
              <Metric label="Average sleep (month)" value={data?.averages?.monthly?.sleepHours ?? "--"} />
              <Metric label="Average screen time (h)" value={data?.averages?.monthly?.screenTimeHours ?? "--"} />
              <Metric label="Average calories" value={data?.averages?.monthly?.calories ?? "--"} />
              <Metric label="Health streak" value={data?.streakDays ? `${data.streakDays} days` : "--"} />
            </>
          )}
        </div>

        <div id="health-trend" className="glass rounded-2xl p-4">
          <h3 className="font-medium">Weekly chart</h3>
          <p className="mt-1 text-xs text-white/60">Compare steps, sleep, and stress.</p>
          <div className="h-56 sm:h-64 mt-3">
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

        <div id="health-insight" className="glass rounded-2xl p-4">
          <p className="text-brand-100 text-xs uppercase tracking-wider">What this means</p>
          <p className="text-sm text-white/80 mt-2">{data?.insight || "No health insight available yet."}</p>
          <p className="text-xs text-white/60 mt-2">
            Weekly average stress: {data?.averages?.weekly?.stressScore ?? "--"} | Weekly average sleep:{" "}
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
