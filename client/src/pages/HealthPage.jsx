import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  ComposedChart,
  Line,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch, describeError } from "../api";
import { isoDay } from "../utils/date";
import DayEntryPreview from "../components/DayEntryPreview";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";
import { MOOD_HEX } from "../utils/moodColors";

// Same stagger/entrance pattern Dashboard and Retrospect use -- this page
// previously rendered with a hard instant cut, the last of the four
// heavily-redesigned pages to still be missing it. Static fallback variants
// keep the same shape so every motion.div below can use one `variants` prop
// unconditionally regardless of the person's prefers-reduced-motion setting.
const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};
const staticContainerVariants = { hidden: {}, visible: {} };
const staticItemVariants = { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } };
const tabFade = { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } };
const staticTabFade = { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } };

// One line color per metric kind -- functional (distinguishing chart lines
// from each other), not decorative -- reused across the three trend charts
// below so "steps" is always the same color on its chart.
const METRIC_ACCENT = {
  steps: { color: "#e8ab5f" },
  sleep: { color: "#8eb184" },
  heartRate: { color: "#a989b2" },
  stress: { color: "#da8b5b" },
  screenTime: { color: "#84689d" },
  calories: { color: "#e8ab5f" },
  streak: { color: "#8fae73" },
};

const MOOD_SCORE_LABEL = { 0: "Angry", 1: "Stressed", 2: "Sad", 3: "Reflective", 4: "Calm", 5: "Happy" };

const CORRELATION_METRIC_LABELS = {
  steps: "Steps",
  sleepHours: "Sleep",
  stressScore: "Stress score",
  restingHeartRate: "Resting heart rate",
};

const CORRELATION_METRIC_COLOR = {
  steps: "#e8ab5f",
  sleepHours: "#8eb184",
  stressScore: "#da8b5b",
  restingHeartRate: "#a989b2",
};

const TABS = [
  { id: "today", label: "Today" },
  { id: "trends", label: "Trends" },
  { id: "connections", label: "Connections" },
];

// Reduces the raw (metric, lag) correlation list down to each metric's
// single strongest-|r| lag -- shared by the bar view and the scatter grid so
// both show the exact same "best" reading per metric instead of drifting out
// of sync if this logic were duplicated slightly differently in two places.
function strongestPerMetric(correlations) {
  const byMetric = new Map();
  for (const c of correlations || []) {
    const existing = byMetric.get(c.metric);
    if (!existing || Math.abs(c.r) > Math.abs(existing.r)) byMetric.set(c.metric, c);
  }
  return Array.from(byMetric.values()).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

// Full structural rework, not a reskin -- previously this page was five
// full-width cards stacked top to bottom (Today stats, Monthly averages,
// Weekly trends, Insight, Correlation), all visible and competing for
// attention at once. Now: one headline finding leads the page (the same
// server-computed correlation description that used to be buried in the
// last card), and everything else lives behind three tabs so you look at
// one focused thing at a time instead of scrolling past all of it.
//
// This pass adds real chart variety on top of that structure -- researched
// against how health/wellness dashboards and mood-tracking apps (Daylio's
// "Year in Pixels", Apple Health's rings, standard health-dashboard UX
// guidance recommending line/area for trends and scatter for correlation --
// not pie/donut, which is the wrong shape for continuous paired data) present
// this exact kind of data, since the previous version (three small line
// charts + a bar list) was flat and visually thin for how much real,
// server-computed statistics this page actually has behind it.
export default function HealthPage() {
  const [data, setData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [tab, setTab] = useState("today");
  const reducedMotion = usePrefersReducedMotion();
  const cVariants = reducedMotion ? staticContainerVariants : containerVariants;
  const iVariants = reducedMotion ? staticItemVariants : itemVariants;
  const tVariants = reducedMotion ? staticTabFade : tabFade;

  const loadOverview = () => apiFetch("/api/health-data/overview").then(setData).catch(() => {});

  useEffect(() => {
    loadOverview();
  }, []);

  const topCorrelations = strongestPerMetric(data?.correlations);
  // The Apple Health companion app (see Settings -> Integrations) was
  // previously the ONLY way a HealthData row ever got created -- anyone
  // trying the web app on its own had no way to put a number in at all, so
  // this whole page (and Dashboard's wellness score) stayed permanently
  // empty. `source` on the latest row tells us whether real data exists yet
  // at all, regardless of which path put it there.
  const hasAnyHealthData = Boolean(data?.latest);

  return (
    <main className="ui-page">
      <motion.div className="max-w-4xl mx-auto space-y-4" variants={cVariants} initial="hidden" animate="visible">
        <motion.div variants={iVariants} className="ui-card rounded-2xl p-5">
          <p className="ui-kicker">Health dashboard</p>
          <h2 className="ui-title mt-1">Mind-body metrics</h2>
          <p className="text-sm text-white/70 mt-2">
            Current status: <span className="font-medium text-white">{data?.status || "Loading..."}</span>
          </p>
        </motion.div>

        {/* Headline finding -- the same real Pearson-correlation sentence
            that used to sit at the very bottom of the page, buried under
            four other cards, now leads the whole page instead. One neutral
            surface + typography, no colored border/tint. */}
        <motion.div variants={iVariants} className="ui-card rounded-2xl p-5">
          <p className="ui-kicker">This month's finding</p>
          <p className="text-base md:text-lg font-medium mt-2 leading-snug">
            {data?.insight || "Keep logging health data and journal entries to unlock a real finding here."}
          </p>
        </motion.div>

        <motion.div variants={iVariants} className="inline-flex gap-1 rounded-xl bg-black/20 p-1 w-full sm:w-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t.id ? "bg-[#8fae73] text-[#16210f]" : "text-white/60 hover:text-white/85"
              }`}
            >
              {t.label}
            </button>
          ))}
        </motion.div>

        {tab === "today" && (
          <motion.div key="today" variants={tVariants} initial="hidden" animate="visible" className="ui-card rounded-2xl p-5">
            <div className="grid sm:grid-cols-[220px_1fr] gap-6 items-center">
              {/* Stress gauge -- previously "Today" was nothing but plain
                  numbers in a row, the emptiest-feeling tab on the page. A
                  ring gauge gives the single most important today-metric
                  (stress score, the one status/insight are both built from)
                  actual visual weight instead of being one more number in a
                  list indistinguishable from the rest. */}
              <StressGauge score={data?.latest?.stressScore} />
              <div>
                <p className="text-xs text-[#d9d2b0] uppercase tracking-wider mb-3 ui-kicker">Today</p>
                <StatStrip
                  items={[
                    { label: "Steps", value: data?.latest?.steps ?? "--", kind: "steps" },
                    { label: "Sleep", value: data?.latest?.sleepHours ? `${data.latest.sleepHours}h` : "--", kind: "sleep" },
                    { label: "Heart rate", value: data?.latest?.restingHeartRate ?? "--", kind: "heartRate" },
                  ]}
                />
              </div>
            </div>
            <div className="pt-5 mt-5 border-t border-white/10">
              <p className="text-xs text-[#d9d2b0] uppercase tracking-wider mb-3 ui-kicker">This month</p>
              <StatStrip
                items={[
                  { label: "Avg steps", value: data?.averages?.monthly?.steps ?? "--", kind: "steps" },
                  { label: "Avg sleep", value: data?.averages?.monthly?.sleepHours ? `${data.averages.monthly.sleepHours}h` : "--", kind: "sleep" },
                  { label: "Screen time", value: data?.averages?.monthly?.screenTimeHours ? `${data.averages.monthly.screenTimeHours}h` : "--", kind: "screenTime" },
                  { label: "Calories", value: data?.averages?.monthly?.calories ?? "--", kind: "calories" },
                  { label: "Streak", value: data?.streakDays ? `${data.streakDays}d` : "--", kind: "streak" },
                ]}
              />
            </div>

            {/* Manual entry -- the Apple Health companion app (Settings ->
                Integrations) was previously the ONLY way a HealthData row
                ever got created. Anyone without it connected had no way to
                put a number in at all, which is why the wellness score and
                every chart on this page could stay permanently empty. */}
            <div className="pt-5 mt-5 border-t border-white/10">
              <p className="text-xs text-[#d9d2b0] uppercase tracking-wider mb-2 ui-kicker">Log today's data</p>
              <p className="text-xs text-white/50 mb-3">
                {hasAnyHealthData
                  ? "No Apple Health sync? Enter today's numbers by hand -- this is what your wellness score and every chart here is built from."
                  : "Nothing here yet -- Dashboard's wellness score and this whole page need at least one entry to show anything. Add today's numbers to get started."}
              </p>
              <LogHealthDataForm onSaved={loadOverview} />
            </div>
          </motion.div>
        )}

        {tab === "trends" && (
          <motion.div key="trends" variants={tVariants} initial="hidden" animate="visible" className="ui-card rounded-2xl p-4 space-y-4">
            <p className="text-xs text-white/60">Click a point on any chart to see what you wrote that day.</p>

            {/* The one chart on this whole page that actually puts health
                and mood on the same axes at the same time, rather than
                making someone flip to Connections and read an abstract r
                value. Steps as bars (left axis), mood as an overlaid line
                (right axis, 0-5) -- the visual gap or overlap between the
                two IS the correlation. */}
            <MoodOverlayChart data={data?.weekly || []} onPointClick={setSelectedDate} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TrendChart
                title="Steps"
                data={data?.weekly || []}
                dataKey="steps"
                accent={METRIC_ACCENT.steps}
                valueLabel="steps"
                axisLabel="steps/day"
                onPointClick={setSelectedDate}
              />
              <TrendChart
                title="Stress"
                data={data?.weekly || []}
                dataKey="stress"
                accent={METRIC_ACCENT.stress}
                valueLabel="/ 100"
                axisLabel="score"
                onPointClick={setSelectedDate}
              />
              <TrendChart
                title="Sleep"
                data={data?.weekly || []}
                dataKey="sleep"
                accent={METRIC_ACCENT.sleep}
                valueLabel="hours"
                axisLabel="hours"
                onPointClick={setSelectedDate}
              />
            </div>
            <DayEntryPreview date={selectedDate} />
          </motion.div>
        )}

        {tab === "connections" && (
          <motion.div key="connections" variants={tVariants} initial="hidden" animate="visible" className="space-y-4">
            <div className="ui-card rounded-2xl p-4">
              <p className="ui-kicker">Real correlation</p>
              <h3 className="font-medium mt-1">Which health metric relates to your mood most?</h3>
              <p className="text-xs text-white/60 mt-2">
                A real Pearson correlation computed from your own paired health + journal days -- not an AI guess. Longer
                bar means a stronger relationship.
              </p>
              <CorrelationBars top={topCorrelations} />
            </div>

            {topCorrelations.length > 0 && (
              <div className="ui-card rounded-2xl p-4">
                <p className="ui-kicker">See the actual data</p>
                <h3 className="font-medium mt-1">Every day, plotted</h3>
                <p className="text-xs text-white/60 mt-2">
                  Each dot is one real day: how much of that metric you had, against your mood. A tight diagonal line
                  of dots is a strong relationship; a scattered cloud is a weak one -- the r value above is just a
                  single number summarizing what these dots show directly.
                </p>
                <div className="grid sm:grid-cols-2 gap-4 mt-4">
                  {topCorrelations.map((c) => (
                    <CorrelationScatter
                      key={c.metric}
                      label={CORRELATION_METRIC_LABELS[c.metric] || c.metric}
                      points={c.points}
                      r={c.r}
                      color={CORRELATION_METRIC_COLOR[c.metric] || "#8fae73"}
                    />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </motion.div>
    </main>
  );
}

// Backed by POST /api/health-data/manual-entry -- the web-reachable
// counterpart to the iOS companion app's sync endpoint. Any single field is
// enough to submit (someone might only know their step count, say), and
// values are cleared after a successful save since this represents "log
// today," not a persistent draft of yesterday's numbers.
function LogHealthDataForm({ onSaved }) {
  const [steps, setSteps] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [restingHeartRate, setRestingHeartRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function save(e) {
    e.preventDefault();
    const body = {};
    if (steps !== "") body.steps = Number(steps);
    if (sleepHours !== "") body.sleepHours = Number(sleepHours);
    if (restingHeartRate !== "") body.restingHeartRate = Number(restingHeartRate);
    if (Object.keys(body).length === 0) {
      setStatus("Enter at least one value.");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      await apiFetch("/api/health-data/manual-entry", { method: "POST", body: JSON.stringify(body) });
      setSteps("");
      setSleepHours("");
      setRestingHeartRate("");
      setStatus("Saved");
      onSaved?.();
    } catch (err) {
      setStatus(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
      <label className="text-xs text-white/60">
        Steps
        <input
          type="number"
          min="0"
          className="ui-input mt-1"
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          placeholder="8000"
        />
      </label>
      <label className="text-xs text-white/60">
        Sleep (hours)
        <input
          type="number"
          min="0"
          max="24"
          step="0.1"
          className="ui-input mt-1"
          value={sleepHours}
          onChange={(e) => setSleepHours(e.target.value)}
          placeholder="7.5"
        />
      </label>
      <label className="text-xs text-white/60">
        Resting heart rate
        <input
          type="number"
          min="20"
          max="220"
          className="ui-input mt-1"
          value={restingHeartRate}
          onChange={(e) => setRestingHeartRate(e.target.value)}
          placeholder="62"
        />
      </label>
      <button type="submit" disabled={saving} className="px-4 py-2.5 min-h-11 ui-button-primary whitespace-nowrap">
        {saving ? "Saving..." : "Save today"}
      </button>
      {status && (
        <p className={`sm:col-span-4 text-xs ${status === "Saved" ? "text-[#c5d7a6]" : "text-red-300"}`}>{status}</p>
      )}
    </form>
  );
}

// Compact horizontal row, columns separated by hairline dividers instead of
// icon-badge tiles -- reads as one connected strip of numbers, same
// treatment as Dashboard's mood/entries/sleep row.
function StatStrip({ items }) {
  return (
    <div className="flex flex-wrap">
      {items.map((item, i) => (
        <div key={item.label} className={`pr-6 ${i > 0 ? "pl-6 border-l border-white/10" : ""} mb-2`}>
          <p className="text-lg font-medium leading-none">{item.value}</p>
          <p className="text-[11px] text-white/60 mt-1.5">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

// A 270-degree ring gauge for today's stress score (0-100), colored by the
// same Good/Moderate/Needs-attention thresholds the server's getStatus()
// uses -- so the color you see here always agrees with the "Current status"
// line at the top of the page instead of being a separately-tuned visual.
function StressGauge({ score }) {
  const s = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null;
  // Raw Tailwind red (#ef4444) previously here read as an "error state"
  // rather than a status color, clashing with the muted earth-tone palette
  // used everywhere else -- MOOD_HEX.angry is the same rust the app already
  // uses for "needs attention" (the angry mood dot), one shared token.
  const color = s == null ? "#64748b" : s >= 70 ? MOOD_HEX.angry : s >= 45 ? MOOD_HEX.happy : MOOD_HEX.calm;
  const label = s == null ? "No data yet" : s >= 70 ? "Needs attention" : s >= 45 ? "Moderate" : "Good";
  return (
    <div className="relative mx-auto w-full max-w-[200px]">
      <ResponsiveContainer width="100%" height={170}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="72%"
          outerRadius="100%"
          barSize={14}
          startAngle={90}
          endAngle={-270}
          data={[{ value: s ?? 0 }]}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar dataKey="value" cornerRadius={7} fill={color} background={{ fill: "rgba(255,255,255,0.08)" }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="ui-title text-3xl leading-none">{s ?? "--"}</p>
        <p className="text-[11px] text-white/50 mt-1.5 text-center px-2">{label}</p>
      </div>
    </div>
  );
}

// Backed by GET /api/health-data/overview's `correlations` array (see
// server/src/shared/utils/correlation.js) -- each entry is a real Pearson
// coefficient for one (metric, lag) pair, computed from this user's own
// data. Takes the already-reduced `top` (one per metric) list so it stays in
// sync with the scatter grid below it.
function CorrelationBars({ top }) {
  if (!top.length) {
    return (
      <p className="text-sm text-white/60 mt-3">
        Not enough days with both health data and a journal entry yet to compute a real correlation.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2.5">
      {top.map((c) => {
        const pct = Math.round(Math.abs(c.r) * 100);
        const positive = c.r >= 0;
        return (
          <div key={c.metric}>
            <div className="flex items-center justify-between text-xs text-white/70">
              <span>
                {CORRELATION_METRIC_LABELS[c.metric] || c.metric}
                {c.lag > 0 ? ` (${c.lag}d later)` : ""}
              </span>
              {/* Raw Tailwind emerald/rose previously here -- bright,
                  saturated greens/pinks that don't exist anywhere else in
                  the app's palette. Swapped for the same sage/rust pair
                  MOOD_HEX already uses for calm/angry, so "good vs bad
                  correlation" reads in the app's own color language. */}
              <span style={{ color: positive ? MOOD_HEX.calm : MOOD_HEX.angry }}>r = {c.r.toFixed(2)}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: positive ? `${MOOD_HEX.calm}b3` : `${MOOD_HEX.angry}b3` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-white/55 mt-1">
        n = paired days used for each metric. "Xd later" means that metric on one day is compared against mood X
        days after.
      </p>
    </div>
  );
}

// Real scatter of paired (metric value, mood score) points -- the raw data
// the correlation bar above is summarizing into one number. Research on
// health-dashboard correlation UX specifically calls out scatter plots
// (rather than another bar or line) as the right shape for "does X relate to
// Y" once you actually have the paired points to show, which
// correlation.js's `points` field now provides.
function CorrelationScatter({ label, points, r, color }) {
  if (!points?.length) return null;
  const positive = r >= 0;
  return (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/80">{label}</p>
        <span className="text-xs" style={{ color: positive ? MOOD_HEX.calm : MOOD_HEX.angry }}>r = {r.toFixed(2)}</span>
      </div>
      <div className="h-40 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
            <XAxis type="number" dataKey="x" tick={{ fill: "#c4bfa0", fontSize: 10 }} name={label} />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 5]}
              tickFormatter={(v) => MOOD_SCORE_LABEL[Math.round(v)] || ""}
              tick={{ fill: "#c4bfa0", fontSize: 9 }}
              width={68}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              formatter={(value, name) => (name === "y" ? MOOD_SCORE_LABEL[Math.round(value)] || value : value)}
            />
            <Scatter data={points} fill={color} fillOpacity={0.75} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Steps (bars, left axis) with mood (line, right axis 0-5) plotted on the
// same week -- the direct visual counterpart to the Connections tab's
// abstract r-value correlation, showing the same relationship as an actual
// picture instead of a summary statistic.
function MoodOverlayChart({ data, onPointClick }) {
  const hasMood = (data || []).some((d) => Number.isFinite(d.mood));
  return (
    <div className="rounded-xl border border-white/10 p-3">
      <p className="text-sm text-white/80">Steps & mood together</p>
      <p className="text-[11px] text-white/60 mt-1">
        {hasMood
          ? "Bars are steps that day; the line is your mood that day."
          : "Log a journal entry on days you also have health data to see mood plotted alongside steps."}
      </p>
      <div className="h-52 mt-2 cursor-pointer">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            onClick={(e) => {
              const raw = e?.activeLabel;
              if (raw && onPointClick) onPointClick(isoDay(new Date(raw)));
            }}
          >
            <XAxis
              dataKey="date"
              tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              tick={{ fill: "#c4bfa0", fontSize: 11 }}
            />
            <YAxis yAxisId="left" tick={{ fill: "#c4bfa0", fontSize: 11 }} />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 5]}
              tickFormatter={(v) => MOOD_SCORE_LABEL[Math.round(v)] || ""}
              tick={{ fill: "#c4bfa0", fontSize: 10 }}
              width={70}
            />
            <Tooltip
              labelFormatter={(v) =>
                new Date(v).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
              }
              formatter={(value, name) => (name === "mood" ? [MOOD_SCORE_LABEL[Math.round(value)] || "--", "Mood"] : [value, "Steps"])}
            />
            <Bar yAxisId="left" dataKey="steps" fill="#e8ab5f" fillOpacity={0.55} radius={[4, 4, 0, 0]} />
            <Line
              yAxisId="right"
              dataKey="mood"
              stroke="#a989b2"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#a989b2" }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TrendChart({ title, data, dataKey, accent, valueLabel, axisLabel, onPointClick }) {
  const gradientId = `trend-grad-${dataKey}`;
  return (
    <div className="rounded-xl border border-white/10 p-3">
      <p className="text-sm text-white/80">{title}</p>
      <div className="h-44 mt-2 cursor-pointer">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            onClick={(e) => {
              // LineChart's own onClick (rather than an onClick on <Line>)
              // gives the nearest data point to wherever inside the chart you
              // clicked, far more forgiving than requiring a precise hit on a
              // thin line or a tiny dot. Recharts 3.x's chart-level click
              // state exposes `activeLabel` (the XAxis dataKey value at the
              // click position) rather than a v2-style `activePayload` array.
              const raw = e?.activeLabel;
              if (raw && onPointClick) onPointClick(isoDay(new Date(raw)));
            }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={accent.color} stopOpacity={0.45} />
                <stop offset="95%" stopColor={accent.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              tick={{ fill: "#c4bfa0", fontSize: 11 }}
            />
            <YAxis tick={{ fill: "#c4bfa0", fontSize: 11 }} tickCount={6} />
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
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={accent.color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-white/50 mt-1 uppercase tracking-wide">{axisLabel}</p>
    </div>
  );
}
