import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, HelpCircle, Repeat, HeartPulse, PartyPopper } from "lucide-react";
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
  const [loadError, setLoadError] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();
  const cVariants = reducedMotion ? staticContainerVariants : containerVariants;
  const iVariants = reducedMotion ? staticItemVariants : itemVariants;

  function loadAnalysis() {
    setLoadError(false);
    // Previously swallowed entirely -- a failed load left this page stuck
    // on "Analyzing entries..." forever with no way to tell a real error
    // apart from a slow AI response.
    return apiFetch("/api/retrospect/analysis")
      .then(setData)
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    loadAnalysis();
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
        {loadError && (
          <motion.div
            variants={iVariants}
            className="ui-card rounded-2xl p-4 border-ember/30 flex items-center justify-between gap-3 flex-wrap"
          >
            <p className="text-sm text-ink/80">Couldn't load your Retrospect data. This may just be a connection hiccup.</p>
            <button type="button" onClick={loadAnalysis} className="text-sm text-signal hover:text-signal-soft font-medium shrink-0">
              Try again
            </button>
          </motion.div>
        )}
        {/* Headline finding -- pull-quote treatment (left rule + serif),
            matching Health's "This month's finding" and Year in Review's "A
            pattern worth knowing" -- the same generated-sentence pattern
            reads consistently across all three pages, and stands apart from
            the boxed data cards around it instead of being just another one. */}
        <motion.div variants={iVariants} className="ui-quote py-1">
          <p className="ui-kicker">Retrospect analysis</p>
          <p className="ui-quote-text text-lg md:text-xl mt-2 leading-snug text-ink/95">
            {data?.emotionalPatternSummary || "Analyzing entries..."}
          </p>
        </motion.div>

        {/* Mood heatmap -- "Year in Pixels"-style calendar of every day's
            mood, the single richest visual on this page. Backed by
            moodHeatmap (see server/src/modules/retrospect/routes.js), a
            much wider day-by-day window than the 20-entry `timeline` the
            bar chart below uses, specifically so this can show real
            sustained coverage instead of a handful of scattered entries. */}
        <motion.div variants={iVariants} className="ui-card-hero p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-medium">Mood, day by day</h3>
              <p className="text-xs text-ink/60 mt-1">Last six months. Click a square to read that day.</p>
            </div>
            <MoodLegend />
          </div>
          <MoodHeatmap entries={data?.moodHeatmap || []} onSelect={setSelectedDate} />
          <DayEntryPreview date={selectedDate} />
        </motion.div>

        {/* items-start -- CSS grid stretches row items to match the tallest
            sibling by default, so the Emotional timeline card (a fixed h-64
            chart plus a couple lines of text) was being stretched down to
            match the right column's full stacked height (Mood balance +
            Recurring themes + Writing rhythm), leaving a large empty void
            under the chart bounded by nothing but the card's own border.
            items-start stopped that void from being enclosed in a card
            border, but the left column (just the chart) was still much
            shorter than the right column's three stacked cards, leaving a
            plain, unbounded empty gap in its place -- so Recurring themes
            (the shortest of the three right-column cards) now lives under
            the chart instead, roughly balancing both columns' heights. */}
        <motion.div variants={iVariants} className="grid lg:grid-cols-3 gap-4 items-start">
          <div className="ui-card rounded-2xl p-4 lg:col-span-2 space-y-4">
            <div>
            <h3 className="font-medium">Emotional timeline</h3>
            <p className="text-xs text-ink/60 mt-2">
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
                <BarChart data={moodSeries} barCategoryGap="35%">
                  {/* Each mood color gets its own top-to-bottom gradient
                      (full tone fading to ~55% of itself) instead of a flat
                      fill -- previously every bar was a single solid color
                      block, which reads as a spreadsheet chart rather than
                      something considered. One gradient per SCORE_COLOR
                      entry, referenced by id below. */}
                  <defs>
                    {Object.entries(SCORE_COLOR).map(([score, color]) => (
                      <linearGradient key={score} id={`moodBar-${score}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                      </linearGradient>
                    ))}
                  </defs>
                  {/* axisLine/tickLine off on both axes -- the default
                      Recharts frame (solid axis lines boxing in the plot
                      area) is one of the more obvious "unstyled chart
                      library" tells; dropping it leaves just the bars and
                      their labels, which reads as considered rather than
                      defaulted. */}
                  <XAxis dataKey="date" tick={{ fill: "rgb(var(--ink) / 0.55)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: "rgb(var(--ink) / 0.55)", fontSize: 12 }}
                    domain={[0, 5]}
                    tickFormatter={(v) => scoreToLabel(v)}
                    width={72}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => scoreToLabel(value)}
                    cursor={{ fill: "rgb(var(--ink) / 0.05)" }}
                    contentStyle={{ background: "rgb(var(--paper-raised))", border: "1px solid rgb(var(--ink) / 0.15)", borderRadius: 8, fontSize: 12 }}
                  />
                  {/* Clickable -- there was no way to go from "this day
                      looked rough" to actually reading that day's entry.
                      Each bar's own Cell colors it by that day's mood
                      (SCORE_COLOR above) instead of one flat fill for every
                      bar regardless of tone. */}
                  <Bar
                    dataKey="score"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                    cursor="pointer"
                    // Recharts' own default (1500ms, generic "ease") reads as
                    // sluggish next to how quickly everything else in this
                    // app settles (~300-450ms, ease-out) -- shortened so a
                    // chart appearing doesn't feel like a different, slower
                    // app underneath the fast one.
                    animationDuration={600}
                    animationEasing="ease-out"
                    onClick={(point) => setSelectedDate(point?.payload?.rawDate || point?.rawDate || null)}
                  >
                    {moodSeries.map((entry, i) => {
                      const roundedScore = Math.round(entry.score);
                      return (
                        <Cell
                          key={i}
                          fill={SCORE_COLOR[roundedScore] ? `url(#moodBar-${roundedScore})` : "rgb(var(--signal))"}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            </div>

            {/* Moved here from the right column -- see the items-start
                comment above the grid for why. Recurring themes is the
                shortest of the three right-column cards, so it's the one
                that best balances the left column's height against the
                right column's remaining two (Mood balance + Writing
                rhythm) without making the left column overshoot instead. */}
            <div className="ui-card rounded-2xl p-4 space-y-3">
              <h3 className="font-medium">Recurring themes</h3>
              {/* Neutral pills instead of colored/tinted ones -- functions as
                  tags, doesn't need its own accent color to read as a tag. */}
              <div className="flex flex-wrap gap-2">
                {(data?.recurringThemes || []).map((theme) => (
                  <span
                    key={theme}
                    className="rounded-full border border-ink/15 bg-ink/5 px-3 py-1.5 text-xs capitalize text-ink/75"
                  >
                    {theme.replace(/_/g, " ")}
                  </span>
                ))}
                {(data?.recurringThemes || []).length === 0 && (
                  <p className="text-xs text-ink/50">Not enough entries yet to detect a recurring theme.</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Mood distribution donut -- the proportional counterpart to
                the day-by-day bar chart on the left: not "what happened
                when" but "how much of each, overall." */}
            <div className="ui-card rounded-2xl p-4">
              <h3 className="font-medium">Mood balance</h3>
              <p className="text-xs text-ink/60 mt-1">Last six months, by proportion.</p>
              <MoodBalance distribution={moodDistribution} />
            </div>

            {/* Purely computed from entry timestamps (see writingRhythm in
                server/src/modules/retrospect/routes.js) -- no AI involved,
                same "real math, not a model's impression" principle as the
                health correlation elsewhere on this page. */}
            <div className="ui-card rounded-2xl p-4">
              <h3 className="font-medium">Writing rhythm</h3>
              <p className="text-xs text-ink/60 mt-1">When you actually tend to write.</p>
              <WritingRhythm rhythm={data?.writingRhythm} />
            </div>
          </div>
        </motion.div>

        {/* Previously three separate stacked cards (behavioral loops, health
            correlation, socratic question) -- merged into one card since
            they're facets of the same analysis. Plain small icons (no
            colored circle badges) plus hairline dividers between rows. */}
        <motion.div variants={iVariants} className="ui-card rounded-2xl p-4 divide-y divide-ink/10">
          <div className="flex items-start gap-3 pb-3.5">
            <Repeat size={16} className="text-ink/55 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="ui-kicker">Behavioral loops</p>
              <p className="text-sm text-ink/80 mt-1">
                {(data?.behavioralLoops || []).join(" • ") || "Not enough entries yet to detect a loop."}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 py-3.5">
            <HeartPulse size={16} className="text-ink/55 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="ui-kicker">Health correlation</p>
              <p className="text-sm text-ink/80 mt-1">{data?.healthCorrelation || "No correlation data yet."}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 pt-3.5">
            <HelpCircle size={16} className="text-ink/55 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="ui-kicker">Socratic question</p>
              <p className="text-ink/90 mt-1">
                {data?.socraticQuestion || "What pattern feels most meaningful to reflect on next?"}
              </p>
              <button
                type="button"
                className="mt-3 px-4 py-2 min-h-11 ui-button-primary"
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
            className="ui-card rounded-2xl p-5 flex items-center justify-between gap-3 hover:bg-ink/5 transition"
          >
            <div className="flex items-center gap-3">
              <PartyPopper size={18} className="text-ink/50 shrink-0" />
              <div>
                <p className="text-sm font-medium">See your full year</p>
                <p className="text-xs text-ink/50 mt-0.5">Entries, streaks, and themes -- the last 12 months, summarized.</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-ink/55 shrink-0" />
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
        <span key={mood} className="inline-flex items-center gap-1 text-[10px] text-ink/60 capitalize">
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
              <div className="h-3 text-[9px] text-ink/50 leading-3">{showLabel ? monthLabel : ""}</div>
              {week.map((cell, di) =>
                cell ? (
                  <button
                    key={di}
                    type="button"
                    title={`${cell.rawDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}${
                      cell.mood ? ` - ${cell.mood}` : ""
                    }`}
                    onClick={() => cell.mood && onSelect(cell.date)}
                    disabled={!cell.mood}
                    className={`h-[11px] w-[11px] rounded-[2px] ${cell.mood ? "cursor-pointer hover:ring-1 hover:ring-ink/50" : "cursor-default"}`}
                    style={{ backgroundColor: cell.mood ? MOOD_COLOR[cell.mood] || "rgb(var(--signal))" : "rgb(var(--ink) / 0.07)" }}
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

// Ranked horizontal bars, not a donut -- a donut asks you to compare angles
// (one of the worst-tested visual encodings for precise comparison; nobody
// can reliably tell whether a 23% wedge is bigger than a 20% one just by
// eye), and it was also the single most "generated dashboard" element on
// this page: pie/donut is the first chart type any charting library's docs
// lead with, which is exactly why it shows up by default rather than by
// choice. A ranked bar list reads in the actual order that matters (most to
// least frequent), the length encodes the number directly instead of an
// angle, and the top mood still gets its own callout line the way the
// donut's center hole used to carry it.
function MoodBalance({ distribution }) {
  if (!distribution.length) {
    return <p className="text-xs text-ink/50 mt-4">Not enough entries yet to show a mood balance.</p>;
  }
  const top = distribution[0];
  const max = distribution[0].pct || 1;
  return (
    <div className="mt-3">
      <p className="ui-hero-number text-3xl capitalize" style={{ color: MOOD_COLOR[top.mood] || "rgb(var(--signal))" }}>
        {top.mood}
      </p>
      <p className="text-xs text-ink/50 mt-1">{top.pct}% of days -- the most common tone in this window.</p>
      <div className="mt-4 space-y-2.5">
        {distribution.map((d) => (
          <div key={d.mood} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-ink/70 capitalize">{d.mood}</span>
            <div className="ui-bar-track flex-1 h-2 rounded-full bg-ink/8 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(4, (d.pct / max) * 100)}%`,
                  background: `linear-gradient(180deg, rgb(255 255 255 / 0.35), rgb(255 255 255 / 0) 65%), ${MOOD_COLOR[d.mood] || "rgb(var(--signal))"}`,
                }}
              />
            </div>
            <span className="w-9 shrink-0 text-right text-xs text-ink/55 ui-mono">{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Four bars (Night/Morning/Afternoon/Evening) rather than a 24-hour
// histogram -- a full hourly breakdown is more precision than "when do you
// write" actually needs and would read as noisy at this card's size; the
// dominant bucket also gets called out in a sentence above the bars so the
// headline answer doesn't require reading the chart at all, same pattern as
// MoodBalance's top-mood callout above.
function WritingRhythm({ rhythm }) {
  if (!rhythm?.eligible) {
    return <p className="text-xs text-ink/50 mt-4">Not enough entries yet to show a writing rhythm.</p>;
  }
  const max = Math.max(1, ...rhythm.byBucket.map((b) => b.count));
  return (
    <div className="mt-3">
      <p className="text-sm text-ink/80">
        Mostly in the <span className="font-medium text-ink">{rhythm.dominantBucket?.toLowerCase()}</span>
        {rhythm.dominantWeekday && (
          <>
            , especially on <span className="font-medium text-ink">{rhythm.dominantWeekday}s</span>
          </>
        )}
        .
      </p>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {rhythm.byBucket.map((b) => (
          <div key={b.id} className="text-center">
            <div className="h-14 flex items-end justify-center">
              <div
                className="w-full max-w-[28px] rounded-t-md transition-all"
                style={{
                  height: `${Math.max(8, (b.count / max) * 100)}%`,
                  background:
                    b.label === rhythm.dominantBucket
                      ? "linear-gradient(90deg, rgb(255 255 255 / 0.25), rgb(255 255 255 / 0) 55%), rgb(var(--signal))"
                      : "rgb(var(--ink) / 0.15)",
                }}
                title={`${b.label}: ${b.count} ${b.count === 1 ? "entry" : "entries"}`}
              />
            </div>
            <p className="text-[10px] text-ink/55 mt-1.5">{b.label}</p>
          </div>
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
