import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, HelpCircle, Repeat, HeartPulse, Sparkles } from "lucide-react";
import { apiFetch } from "../api";
import { isoDay } from "../utils/date";
import DayEntryPreview from "../components/DayEntryPreview";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";
import { MOOD_HEX } from "../utils/moodColors";

// Same stagger/entrance pattern Dashboard uses -- previously this page (and
// Health) rendered with a hard instant cut while Dashboard picked up real
// motion, the one visual inconsistency left among the heavily-redesigned
// pages. Static fallback variants keep the same shape so every motion.div
// below can use one `variants` prop unconditionally regardless of the
// person's prefers-reduced-motion setting.
const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};
const staticContainerVariants = { hidden: {}, visible: {} };
const staticItemVariants = { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } };

// Same score buckets moodToScore()/scoreToLabel() already use below, mapped
// to each mood's real color from the rest of the app's palette -- previously
// every bar was the same flat olive-green regardless of the day's actual
// tone, so the chart's shape was informative but its color carried no
// information. Now the color itself tells you the tone at a glance, same as
// the mood calendar/dashboard dots.
const SCORE_COLOR = {
  5: MOOD_HEX.happy,
  4: MOOD_HEX.calm,
  3: MOOD_HEX.reflective,
  2: MOOD_HEX.sad,
  1: MOOD_HEX.stressed,
  0: MOOD_HEX.angry,
};

const MOOD_COLOR = MOOD_HEX;

const HEATMAP_DAYS = 182;

function dayKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function RetrospectPage() {
  const [data, setData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();
  const cVariants = reducedMotion ? staticContainerVariants : containerVariants;
  const iVariants = reducedMotion ? staticItemVariants : itemVariants;

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

  // Donut breakdown of every mood logged in the last ~6 months (same
  // moodHeatmap data the calendar below uses) -- gives the "what's the
  // overall balance" read that neither the day-by-day bar chart nor a
  // single "most frequent" sentence can, since both of those only surface
  // the single most common mood rather than the actual proportions.
  const moodDistribution = useMemo(() => {
    const counts = {};
    for (const e of data?.moodHeatmap || []) {
      if (!e.mood) continue;
      counts[e.mood] = (counts[e.mood] || 0) + 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return Object.entries(counts)
      .map(([mood, count]) => ({ mood, count, pct: total ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [data?.moodHeatmap]);

  return (
    <main className="ui-page">
      <motion.div className="max-w-6xl mx-auto space-y-4" variants={cVariants} initial="hidden" animate="visible">
        {/* Headline finding -- one neutral surface + typography (Fraunces
            for the actual finding) instead of a colored/tinted border. Same
            restraint as Health page's headline card. */}
        <motion.div variants={iVariants} className="ui-card rounded-2xl p-5">
          <p className="ui-kicker">Retrospect analysis</p>
          <p className="text-base md:text-lg font-medium mt-2 leading-snug">
            {data?.emotionalPatternSummary || "Analyzing entries..."}
          </p>
        </motion.div>

        {/* Mood heatmap -- "Year in Pixels"-style calendar of every day's
            mood, the single richest visual on this page. Backed by
            moodHeatmap (see server/src/modules/retrospect/routes.js), a
            much wider day-by-day window than the 20-entry `timeline` the
            bar chart below uses, specifically so this can show real
            sustained coverage instead of a handful of scattered entries. */}
        <motion.div variants={iVariants} className="ui-card rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-medium">Mood, day by day</h3>
              <p className="text-xs text-white/60 mt-1">Last six months. Click a square to read that day.</p>
            </div>
            <MoodLegend />
          </div>
          <MoodHeatmap entries={data?.moodHeatmap || []} onSelect={setSelectedDate} />
          <DayEntryPreview date={selectedDate} />
        </motion.div>

        <motion.div variants={iVariants} className="grid lg:grid-cols-3 gap-4">
          <div className="ui-card rounded-2xl p-4 lg:col-span-2">
            <h3 className="font-medium">Emotional timeline</h3>
            <p className="text-xs text-white/60 mt-2">
              Each bar shows the emotional tone of that day, colored to match. Click a bar to see what you wrote.
            </p>
            <div className="h-64 mt-3">
              {/* key forces a full remount once real data arrives. Recharts
                  measures the ResponsiveContainer on first mount, which
                  happens immediately with an empty moodSeries (before the
                  fetch resolves) -- on some layouts that first measurement
                  comes back as 0/-1 (visible as a "width(-1) and height(-1)"
                  console warning). The Y-axis ticks correctly recompute off
                  the container's real size once it settles, but the Bar
                  shapes' own y-scale stayed pinned to that first, broken
                  measurement -- bars rendered at roughly 1/14th their real
                  height while the axis they were plotted against was already
                  full-size. Remounting the chart fresh once `data` (and so a
                  non-empty moodSeries) exists sidesteps the stale-scale
                  entirely instead of trying to force Recharts to
                  re-measure. */}
              <ResponsiveContainer key={data ? "loaded" : "loading"} width="100%" height="100%">
                <BarChart data={moodSeries}>
                  <XAxis dataKey="date" tick={{ fill: "#c4bfa0", fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: "#c4bfa0", fontSize: 12 }}
                    domain={[0, 5]}
                    tickFormatter={(v) => scoreToLabel(v)}
                    width={72}
                  />
                  <Tooltip formatter={(value) => scoreToLabel(value)} />
                  {/* Clickable -- there was no way to go from "this day
                      looked rough" to actually reading that day's entry.
                      Each bar's own Cell colors it by that day's mood
                      (SCORE_COLOR above) instead of one flat fill for every
                      bar regardless of tone. */}
                  <Bar
                    dataKey="score"
                    radius={[8, 8, 0, 0]}
                    cursor="pointer"
                    onClick={(point) => setSelectedDate(point?.payload?.rawDate || point?.rawDate || null)}
                  >
                    {moodSeries.map((entry, i) => (
                      <Cell key={i} fill={SCORE_COLOR[Math.round(entry.score)] ?? "#8fae73"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-4">
            {/* Mood distribution donut -- the proportional counterpart to
                the day-by-day bar chart on the left: not "what happened
                when" but "how much of each, overall." */}
            <div className="ui-card rounded-2xl p-4">
              <h3 className="font-medium">Mood balance</h3>
              <p className="text-xs text-white/60 mt-1">Last six months, by proportion.</p>
              <MoodDonut distribution={moodDistribution} />
            </div>

            <div className="ui-card rounded-2xl p-4 space-y-3">
              <h3 className="font-medium">Recurring themes</h3>
              {/* Neutral pills instead of colored/tinted ones -- functions as
                  tags, doesn't need its own accent color to read as a tag. */}
              <div className="flex flex-wrap gap-2">
                {(data?.recurringThemes || []).map((theme) => (
                  <span
                    key={theme}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs capitalize text-white/75"
                  >
                    {theme.replace(/_/g, " ")}
                  </span>
                ))}
                {(data?.recurringThemes || []).length === 0 && (
                  <p className="text-xs text-white/50">Not enough entries yet to detect a recurring theme.</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Previously three separate stacked cards (behavioral loops, health
            correlation, socratic question) -- merged into one card since
            they're facets of the same analysis. Plain small icons (no
            colored circle badges) plus hairline dividers between rows. */}
        <motion.div variants={iVariants} className="ui-card rounded-2xl p-4 divide-y divide-white/10">
          <div className="flex items-start gap-3 pb-3.5">
            <Repeat size={16} className="text-white/55 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="ui-kicker">Behavioral loops</p>
              <p className="text-sm text-white/80 mt-1">
                {(data?.behavioralLoops || []).join(" • ") || "Not enough entries yet to detect a loop."}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 py-3.5">
            <HeartPulse size={16} className="text-white/55 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="ui-kicker">Health correlation</p>
              <p className="text-sm text-white/80 mt-1">{data?.healthCorrelation || "No correlation data yet."}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 pt-3.5">
            <HelpCircle size={16} className="text-white/55 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="ui-kicker">Socratic question</p>
              <p className="text-white/90 mt-1">
                {data?.socraticQuestion || "What pattern feels most meaningful to reflect on next?"}
              </p>
              <button
                type="button"
                className="mt-3 px-4 py-2 ui-button-primary"
                onClick={() => navigate("/chat", { state: { prefill: data?.socraticQuestion } })}
              >
                Continue reflection
              </button>
            </div>
          </div>
        </motion.div>

        {/* Reciprocal link to Year in Review -- previously that page linked
            back here ("Back to Retrospect") but nothing on this page pointed
            forward to it, so the connection only went one direction. */}
        <motion.div variants={iVariants}>
          <Link
            to="/year-in-review"
            className="ui-card rounded-2xl p-5 flex items-center justify-between gap-3 hover:bg-white/5 transition"
          >
            <div className="flex items-center gap-3">
              <Sparkles size={18} className="text-white/50 shrink-0" />
              <div>
                <p className="text-sm font-medium">See your full year</p>
                <p className="text-xs text-white/50 mt-0.5">Entries, streaks, and themes -- the last 12 months, summarized.</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-white/55 shrink-0" />
          </Link>
        </motion.div>
      </motion.div>
    </main>
  );
}

function MoodLegend() {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {Object.entries(MOOD_COLOR).map(([mood, color]) => (
        <span key={mood} className="inline-flex items-center gap-1 text-[10px] text-white/60 capitalize">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
          {mood}
        </span>
      ))}
    </div>
  );
}

// GitHub-contributions-style calendar: a fixed trailing window (not tied to
// account age) so a newer account still gets a substantial, legible grid
// instead of either a handful of squares or an unusably long empty year.
// Weeks run left-to-right as columns, Sun-Sat top-to-bottom within each
// column -- the same convention as GitHub/Daylio's "Year in Pixels" that
// this is deliberately modeled on, per the visualization research behind
// this pass (calendar heatmaps are the standard way mood-tracking apps show
// "the whole picture at once" rather than a scrolling list).
function MoodHeatmap({ entries, onSelect }) {
  const byDate = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      if (e?.date) map.set(e.date, e.mood);
    }
    return map;
  }, [entries]);

  const weeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cells = [];
    for (let i = HEATMAP_DAYS - 1; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = dayKeyFromDate(d);
      cells.push({ date: key, weekday: d.getDay(), mood: byDate.get(key) || null, rawDate: d });
    }
    const padded = Array(cells[0].weekday).fill(null).concat(cells);
    const out = [];
    for (let i = 0; i < padded.length; i += 7) out.push(padded.slice(i, i + 7));
    return out;
  }, [byDate]);

  let lastMonth = null;

  return (
    <div className="mt-4 overflow-x-auto scroll-area pb-2">
      <div className="inline-flex gap-[3px]">
        {weeks.map((week, wi) => {
          const firstReal = week.find((c) => c);
          const monthLabel = firstReal ? firstReal.rawDate.toLocaleDateString(undefined, { month: "short" }) : null;
          const showLabel = monthLabel && monthLabel !== lastMonth;
          if (showLabel) lastMonth = monthLabel;
          return (
            <div key={wi} className="flex flex-col gap-[3px]">
              <div className="h-3 text-[9px] text-white/50 leading-3">{showLabel ? monthLabel : ""}</div>
              {week.map((cell, di) =>
                cell ? (
                  <button
                    key={di}
                    type="button"
                    title={`${cell.rawDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}${
                      cell.mood ? ` — ${cell.mood}` : ""
                    }`}
                    onClick={() => cell.mood && onSelect(cell.date)}
                    disabled={!cell.mood}
                    className={`h-[11px] w-[11px] rounded-[2px] ${cell.mood ? "cursor-pointer hover:ring-1 hover:ring-white/50" : "cursor-default"}`}
                    style={{ backgroundColor: cell.mood ? MOOD_COLOR[cell.mood] || "#8fae73" : "rgba(255,255,255,0.06)" }}
                  />
                ) : (
                  <div key={di} className="h-[11px] w-[11px]" />
                ),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Donut, not pie -- the center hole is used to show the single top mood +
// its share as text, so the chart isn't purely decorative even at a glance.
function MoodDonut({ distribution }) {
  if (!distribution.length) {
    return <p className="text-xs text-white/50 mt-4">Not enough entries yet to show a mood balance.</p>;
  }
  const top = distribution[0];
  return (
    <div className="mt-2">
      <div className="relative h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={distribution}
              dataKey="count"
              nameKey="mood"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="none"
            >
              {distribution.map((d) => (
                <Cell key={d.mood} fill={MOOD_COLOR[d.mood] || "#8fae73"} />
              ))}
            </Pie>
            <Tooltip formatter={(value, _name, entry) => [`${value} days (${entry.payload.pct}%)`, entry.payload.mood]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-xl font-medium capitalize">{top.mood}</p>
          <p className="text-[11px] text-white/50">{top.pct}% of days</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2 justify-center">
        {distribution.map((d) => (
          <span key={d.mood} className="inline-flex items-center gap-1.5 text-[11px] text-white/60 capitalize">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: MOOD_COLOR[d.mood] || "#8fae73" }} />
            {d.mood} · {d.pct}%
          </span>
        ))}
      </div>
    </div>
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
