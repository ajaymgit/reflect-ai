import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  ComposedChart,
  Line,
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
  streak: { color: "rgb(var(--signal))" },
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
  const reducedMotion = usePrefersReducedMotion();
  const cVariants = reducedMotion ? staticContainerVariants : containerVariants;
  const iVariants = reducedMotion ? staticItemVariants : itemVariants;

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
          <p className="text-sm text-ink/70 mt-2">
            Current status: <span className="font-medium text-ink">{data?.status || "Loading..."}</span>
          </p>
        </motion.div>

        {/* Headline finding -- the same real Pearson-correlation sentence
            that used to sit at the very bottom of the page, buried under
            four other cards, now leads the whole page instead. Pull-quote
            treatment (left rule + serif) rather than another boxed card, so
            the one generated sentence worth reading first actually looks
            different from the stat tiles around it instead of blending in. */}
        <motion.div variants={iVariants} className="ui-quote py-1">
          <p className="ui-kicker">This month's finding</p>
          <p className="ui-quote-text text-lg md:text-xl mt-2 leading-snug text-ink/95">
            {data?.insight || "Keep logging health data and journal entries to unlock a real finding here."}
          </p>
        </motion.div>

        {/* Previously Today/Trends/Connections were three tabs, one visible
            at a time -- switching away from Today made the page feel like
            it had almost nothing in it (a single stat card), when in
            reality there's a real month of trend charts and a whole
            correlation analysis sitting one click away. Now all three
            render in sequence on one continuously-scrollable page, each
            under its own section header, so the page's actual depth is
            visible without anyone having to know to click "Trends" first. */}

        {/* .ui-card-hero -- this card carries the page's actual hero numbers
            (today's stress, steps, sleep), so it gets the bigger-radius tier
            instead of matching the header card's rounded-2xl. */}
        <motion.div variants={iVariants}>
          <p className="ui-kicker mb-2">Today</p>
          <div className="ui-card-hero p-5">
            {/* Steps and sleep used to sit in a bare StatStrip -- plain
                digits and a tiny gray label, no color, no context -- right
                next to stress's full hero treatment (big colored number,
                status word, progress bar). The three metrics read as
                wildly inconsistent in how much attention they got, even
                though all three are equally real, equally important daily
                numbers. Same hero treatment, same tiering language, and a
                real "vs your week" comparison (computed from the same
                weekly series Trends already fetches) now apply to all
                three, so a bare "8,200" actually says whether 8,200 is a
                lot for THIS person. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <MetricHero
                kicker="Stress"
                value={Number.isFinite(data?.latest?.stressScore) ? data.latest.stressScore : "--"}
                tier={stressTier(data?.latest?.stressScore)}
                compareText={compareToWeek(data?.latest?.stressScore, average(data?.weekly, "stress"), (n) => `${Math.round(n)} pts`)}
                raw={data?.latest?.stressScore}
                scale={STRESS_SCALE}
              />
              <MetricHero
                kicker="Steps"
                value={Number.isFinite(data?.latest?.steps) ? data.latest.steps.toLocaleString() : "--"}
                tier={stepsTier(data?.latest?.steps)}
                compareText={compareToWeek(data?.latest?.steps, average(data?.weekly, "steps"), (n) => Math.round(n).toLocaleString())}
                raw={data?.latest?.steps}
                scale={STEPS_SCALE}
              />
              <MetricHero
                kicker="Sleep"
                value={Number.isFinite(data?.latest?.sleepHours) ? `${data.latest.sleepHours}h` : "--"}
                tier={sleepTier(data?.latest?.sleepHours)}
                compareText={compareToWeek(data?.latest?.sleepHours, average(data?.weekly, "sleep"), (n) => `${n.toFixed(1)}h`)}
                raw={data?.latest?.sleepHours}
                scale={SLEEP_SCALE}
              />
            </div>
            {Number.isFinite(data?.latest?.restingHeartRate) && (
              <p className="text-xs text-ink/50 mt-5">
                Resting heart rate today: <span className="text-ink/80 font-medium">{data.latest.restingHeartRate} bpm</span>
              </p>
            )}
            <div className="pt-5 mt-5 border-t border-ink/10">
              <p className="text-xs text-signal uppercase tracking-wider mb-3 ui-kicker">This month</p>
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
            <div className="pt-5 mt-5 border-t border-ink/10">
              <p className="text-xs text-signal uppercase tracking-wider mb-2 ui-kicker">Log today's data</p>
              <p className="text-xs text-ink/50 mb-3">
                {hasAnyHealthData
                  ? "No Apple Health sync? Enter today's numbers by hand -- this is what your wellness score and every chart here is built from."
                  : "Nothing here yet -- Dashboard's wellness score and this whole page need at least one entry to show anything. Add today's numbers to get started."}
              </p>
              <LogHealthDataForm onSaved={loadOverview} />
            </div>
          </div>
        </motion.div>

        <motion.div variants={iVariants}>
          <p className="ui-kicker mb-2">Trends</p>
          <div className="ui-card rounded-2xl p-4 space-y-4">
            <p className="text-xs text-ink/60">Click a point on any chart to see what you wrote that day.</p>

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
          </div>
        </motion.div>

        <motion.div variants={iVariants} className="space-y-4">
          <p className="ui-kicker -mb-2">Connections</p>
          <div className="ui-card rounded-2xl p-4">
            <p className="ui-kicker">Real correlation</p>
            <h3 className="font-medium mt-1">Which health metric relates to your mood most?</h3>
              <p className="text-xs text-ink/60 mt-2">
                A real Pearson correlation computed from your own paired health + journal days -- not an AI guess. Longer
                bar means a stronger relationship.
              </p>
              <CorrelationBars top={topCorrelations} />
            </div>

            {topCorrelations.length > 0 && (
              <div className="ui-card rounded-2xl p-4">
                <p className="ui-kicker">See the actual data</p>
                <h3 className="font-medium mt-1">Every day, plotted</h3>
                <p className="text-xs text-ink/60 mt-2">
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
                      color={CORRELATION_METRIC_COLOR[c.metric] || "rgb(var(--signal))"}
                    />
                  ))}
                </div>
              </div>
            )}
        </motion.div>
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
      <label className="text-xs text-ink/60">
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
      <label className="text-xs text-ink/60">
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
      <label className="text-xs text-ink/60">
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
        <p className={`sm:col-span-4 text-xs ${status === "Saved" ? "text-ember-soft" : "text-red-300"}`}>{status}</p>
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
        <div key={item.label} className={`pr-6 ${i > 0 ? "pl-6 border-l border-ink/10" : ""} mb-2`}>
          <p className="text-lg font-medium leading-none">{item.value}</p>
          <p className="text-[11px] text-ink/60 mt-1.5">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

// Shared Good/Moderate/Needs-attention tiering, one function per metric --
// stress's thresholds match the server's getStatus() so the color here
// always agrees with the "Current status" line at the top of the page.
// Steps and sleep get the same three-tier treatment (rather than being bare
// numbers) using ordinary health-guidance thresholds (10k steps/day as an
// "active" day, 7-9h as a typical healthy sleep range) -- not a precision
// medical claim, just enough to say whether today's number is worth a
// second look. Raw Tailwind red/green previously here read as "error
// state" colors that clashed with the muted earth-tone palette; MOOD_HEX
// is the same rust/amber/sage pair already used everywhere else, so
// good/moderate/needs-attention reads in the app's own color language.
function stressTier(score) {
  if (!Number.isFinite(score)) return { color: "#64748b", label: "No data yet" };
  if (score >= 70) return { color: MOOD_HEX.angry, label: "Needs attention" };
  if (score >= 45) return { color: MOOD_HEX.happy, label: "Moderate" };
  return { color: MOOD_HEX.calm, label: "Good" };
}

function stepsTier(steps) {
  if (!Number.isFinite(steps)) return { color: "#64748b", label: "No data yet" };
  if (steps >= 8000) return { color: MOOD_HEX.calm, label: "Active day" };
  if (steps >= 4000) return { color: MOOD_HEX.happy, label: "Getting there" };
  return { color: MOOD_HEX.angry, label: "Low activity" };
}

function sleepTier(hours) {
  if (!Number.isFinite(hours)) return { color: "#64748b", label: "No data yet" };
  if (hours < 6) return { color: MOOD_HEX.angry, label: "Short sleep" };
  if (hours < 7) return { color: MOOD_HEX.happy, label: "A bit short" };
  if (hours <= 9) return { color: MOOD_HEX.calm, label: "Well rested" };
  return { color: MOOD_HEX.happy, label: "Longer than usual" };
}

// Client-side average over the same weekly series the Trends tab already
// fetches -- no second request needed to give "Today" a real baseline.
function average(list, key) {
  const vals = (list || []).map((d) => d[key]).filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// "vs your week" -- previously today's steps/sleep/stress were bare digits
// with no baseline, so there was no way to tell whether 8,200 steps is a
// lot for THIS person. A factual, non-editorializing delta against their
// own last-7-days average (the tier color above already carries the
// good/bad read) gives every number real context.
function compareToWeek(value, weekAvg, format) {
  if (!Number.isFinite(value) || !Number.isFinite(weekAvg)) return null;
  const diff = value - weekAvg;
  if (Math.abs(diff) < weekAvg * 0.03) return "about your week's average";
  const sign = diff > 0 ? "+" : "-";
  return `${sign}${format(Math.abs(diff))} vs your week`;
}

// Stress, steps and sleep each mean "better" in a different direction --
// lower for stress, higher for steps, a sweet spot in the middle for sleep.
// A single percent-fill bar can't say any of that (a bad, high-stress day
// filled the bar just as much as a good, high-steps day), so each metric
// instead gets its true range plus a shaded "healthy zone" pulled straight
// from the tier thresholds above, and RangeGauge below just draws where
// today's value landed against that zone.
const STRESS_SCALE = { min: 0, max: 100, goodMin: 0, goodMax: 45 };
const STEPS_SCALE = { min: 0, max: 12000, goodMin: 8000, goodMax: 12000 };
const SLEEP_SCALE = { min: 4, max: 11, goodMin: 7, goodMax: 9 };

// Track with a shaded healthy-range band and a single marker dot for
// today's value -- replaces the old ambiguous "fuller = better" bar so the
// same visual language works whether the goal is low (stress), high
// (steps), or a mid-range sweet spot (sleep).
function RangeGauge({ value, scale, color }) {
  const { min, max, goodMin, goodMax } = scale;
  const hasValue = Number.isFinite(value);
  // If today's value falls outside [min, max] (e.g. a 13h sleep night, or a
  // step count past the 12k ceiling), stretch the track to fit it instead of
  // clamping the dot to the edge -- clamping would make 12h and 20h of sleep
  // look identical. The healthy-zone band is computed against this same
  // stretched range so it stays proportionally accurate.
  const rangeMin = hasValue ? Math.min(min, value) : min;
  const rangeMax = hasValue ? Math.max(max, value) : max;
  const toPct = (v) => Math.max(0, Math.min(100, ((v - rangeMin) / (rangeMax - rangeMin)) * 100));
  const zoneStart = toPct(goodMin);
  const zoneEnd = toPct(goodMax);

  return (
    <div className="relative h-1.5 rounded-full bg-ink/8 mt-3 max-w-[160px]">
      {/* Was bg-ink/15 on a bg-ink/8 track -- an 8%-vs-15% grey-on-grey
          difference that reads as basically flat in the dark theme, so the
          whole point of this gauge (see where today's value falls against
          the healthy zone) was invisible. Tinting the zone in the metric's
          own color at a readable-but-still-recessive opacity makes it a
          real landmark on the track, while the marker dot above stays the
          only fully-opaque element so it's still clearly "today's value". */}
      <div
        className="absolute top-0 h-full rounded-full"
        style={{
          left: `${zoneStart}%`,
          width: `${Math.max(0, zoneEnd - zoneStart)}%`,
          backgroundColor: color,
          opacity: 0.3,
        }}
      />
      {hasValue && (
        <div
          className="absolute top-1/2 w-2.5 h-2.5 rounded-full border-2 border-white transition-[left] duration-300 ease-out"
          style={{ left: `${toPct(value)}%`, transform: "translate(-50%, -50%)", background: color, boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }}
        />
      )}
    </div>
  );
}

function MetricHero({ kicker, value, tier, compareText, raw, scale }) {
  return (
    <div>
      <p className="ui-hero-number text-4xl" style={{ color: tier.color }}>
        {value}
      </p>
      <p className="ui-kicker mt-1.5" style={{ color: tier.color }}>
        {tier.label}
      </p>
      {compareText && <p className="text-[11px] text-ink/50 mt-1">{compareText}</p>}
      <RangeGauge value={raw} scale={scale} color={tier.color} />
      <p className="text-[10px] text-ink/45 mt-1.5 uppercase tracking-wide">{kicker}</p>
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
      <p className="text-sm text-ink/60 mt-3">
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
            <div className="flex items-center justify-between text-xs text-ink/70">
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
            <div className="mt-1 h-2 rounded-full bg-ink/10 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: positive ? `${MOOD_HEX.calm}b3` : `${MOOD_HEX.angry}b3` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-ink/55 mt-1">
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
    <div className="rounded-xl border border-ink/10 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink/80">{label}</p>
        <span className="text-xs" style={{ color: positive ? MOOD_HEX.calm : MOOD_HEX.angry }}>r = {r.toFixed(2)}</span>
      </div>
      <div className="h-40 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
            <XAxis type="number" dataKey="x" tick={{ fill: "rgb(var(--ink) / 0.55)", fontSize: 10 }} name={label} axisLine={false} tickLine={false} />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 5]}
              tickFormatter={(v) => MOOD_SCORE_LABEL[Math.round(v)] || ""}
              tick={{ fill: "rgb(var(--ink) / 0.55)", fontSize: 9 }}
              width={68}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              formatter={(value, name) => (name === "y" ? MOOD_SCORE_LABEL[Math.round(value)] || value : value)}
              contentStyle={{ background: "rgb(var(--paper-raised))", border: "1px solid rgb(var(--ink) / 0.15)", borderRadius: 8, fontSize: 11 }}
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
    <div className="rounded-xl border border-ink/10 p-3">
      <p className="text-sm text-ink/80">Steps & mood together</p>
      <p className="text-[11px] text-ink/60 mt-1">
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
            {/* Same top-to-bottom gradient treatment as the Steps/Stress/
                Sleep TrendCharts below (see gradientId there) -- previously
                this was the one bar fill left flat/solid on the page. */}
            <defs>
              <linearGradient id="stepsBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e8ab5f" stopOpacity={0.85} />
                <stop offset="100%" stopColor="#e8ab5f" stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              tick={{ fill: "rgb(var(--ink) / 0.55)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis yAxisId="left" tick={{ fill: "rgb(var(--ink) / 0.55)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 5]}
              tickFormatter={(v) => MOOD_SCORE_LABEL[Math.round(v)] || ""}
              tick={{ fill: "rgb(var(--ink) / 0.55)", fontSize: 10 }}
              width={70}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              labelFormatter={(v) =>
                new Date(v).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
              }
              formatter={(value, name) => (name === "mood" ? [MOOD_SCORE_LABEL[Math.round(value)] || "--", "Mood"] : [value, "Steps"])}
              contentStyle={{ background: "rgb(var(--paper-raised))", border: "1px solid rgb(var(--ink) / 0.15)", borderRadius: 8, fontSize: 11 }}
            />
            <Bar yAxisId="left" dataKey="steps" fill="url(#stepsBarGradient)" radius={[4, 4, 0, 0]} />
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
    <div className="rounded-xl border border-ink/10 p-3">
      <p className="text-sm text-ink/80">{title}</p>
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
              tick={{ fill: "rgb(var(--ink) / 0.55)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fill: "rgb(var(--ink) / 0.55)", fontSize: 11 }} tickCount={6} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value) => [`${value} ${valueLabel}`, title]}
              labelFormatter={(v) =>
                new Date(v).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })
              }
              contentStyle={{ background: "rgb(var(--paper-raised))", border: "1px solid rgb(var(--ink) / 0.15)", borderRadius: 8, fontSize: 11 }}
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
      <p className="text-[11px] text-ink/50 mt-1 uppercase tracking-wide">{axisLabel}</p>
    </div>
  );
}
