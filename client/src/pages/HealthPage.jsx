import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "../api";
import { isoDay } from "../utils/date";
import DayEntryPreview from "../components/DayEntryPreview";

export default function HealthPage() {
  const [data, setData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    apiFetch("/api/health-data/overview")
      .then(setData)
      .catch(() => {});
  }, []);

  return (
    <main className="ui-page">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="ui-card rounded-2xl p-5">
          <p className="ui-kicker">Health Dashboard</p>
          <h2 className="ui-title mt-1">Mind-body metrics</h2>
          <p className="text-base text-white/75 mt-2">
            Current status: <span className="font-medium text-white">{data?.status || "Loading..."}</span>
          </p>
        </div>

        {/* Previously each stat was its own full ui-card (the same heavy
            bordered/blurred treatment as the page's outer cards) sitting
            directly on the page -- nine bordered boxes in a row, a visibly
            different pattern from Dashboard's matching stat grid, which
            groups its cells with the lighter `surface` style inside one
            wrapping card. Same data, same layout intent, now the same
            treatment. */}
        <div className="ui-card rounded-2xl p-5">
          <p className="text-xs text-[#d9d2b0] uppercase tracking-wider">Today</p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <Metric label="Steps" value={data?.latest?.steps ?? "--"} />
            <Metric label="Sleep (h)" value={data?.latest?.sleepHours ?? "--"} />
            <Metric label="Heart rate" value={data?.latest?.restingHeartRate ?? "--"} />
            <Metric label="Stress score" value={data?.latest?.stressScore ?? "--"} />
          </div>

          <p className="text-xs text-[#d9d2b0] uppercase tracking-wider mt-5">Monthly averages</p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <Metric label="Avg steps (month)" value={data?.averages?.monthly?.steps ?? "--"} />
            <Metric label="Avg sleep (month)" value={data?.averages?.monthly?.sleepHours ?? "--"} />
            <Metric label="Avg screen time (h)" value={data?.averages?.monthly?.screenTimeHours ?? "--"} />
            <Metric label="Avg calories" value={data?.averages?.monthly?.calories ?? "--"} />
            <Metric label="Health streak" value={data?.streakDays ? `${data.streakDays} days` : "--"} />
          </div>
        </div>

        <div className="ui-card rounded-2xl p-4">
          <h3 className="font-medium">Weekly trends</h3>
          <p className="text-xs text-white/60 mt-1">Click a point on any chart to see what you wrote that day.</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-3">
            <TrendChart
              title="Steps"
              data={data?.weekly || []}
              dataKey="steps"
              stroke="#e8ab5f"
              valueLabel="steps"
              axisLabel="steps/day"
              onPointClick={setSelectedDate}
            />
            <TrendChart
              title="Stress"
              data={data?.weekly || []}
              dataKey="stress"
              stroke="#da8b5b"
              valueLabel="/ 100"
              axisLabel="score"
              onPointClick={setSelectedDate}
            />
            <TrendChart
              title="Sleep"
              data={data?.weekly || []}
              dataKey="sleep"
              stroke="#8eb184"
              valueLabel="hours"
              axisLabel="hours"
              onPointClick={setSelectedDate}
            />
          </div>
          <DayEntryPreview date={selectedDate} />
        </div>

        <div className="ui-card rounded-2xl p-4">
          <p className="ui-kicker">Insight</p>
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
    <div className="surface rounded-2xl p-5">
      <p className="text-sm text-white/70">{label}</p>
      <p className="text-3xl font-semibold mt-2">{value}</p>
    </div>
  );
}

function TrendChart({ title, data, dataKey, stroke, valueLabel, axisLabel, onPointClick }) {
  return (
    <div className="rounded-xl border border-white/10 p-3">
      <p className="text-sm text-white/80">{title}</p>
      <div className="h-48 mt-2 cursor-pointer">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            onClick={(e) => {
              // Was previously not clickable at all -- LineChart's own
              // onClick (rather than an onClick on <Line>) gives the nearest
              // data point to wherever inside the chart you clicked, which is
              // far more forgiving than requiring a precise hit on a thin
              // line or a tiny dot. Recharts 3.x's chart-level click state
              // exposes `activeLabel` (the XAxis dataKey value at the click
              // position) rather than a v2-style `activePayload` array.
              const raw = e?.activeLabel;
              if (raw && onPointClick) onPointClick(isoDay(new Date(raw)));
            }}
          >
            <XAxis
              dataKey="date"
              tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              tick={{ fill: "#cbd5e1", fontSize: 11 }}
            />
            <YAxis tick={{ fill: "#cbd5e1", fontSize: 11 }} tickCount={6} />
            <Tooltip
              formatter={(value) => [`${value} ${valueLabel}`, title]}
              labelFormatter={(v) =>
                new Date(v).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })
              }
            />
            <Line type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-white/50 mt-1 uppercase tracking-wide">{axisLabel}</p>
    </div>
  );
}
