import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, HelpCircle, Repeat, HeartPulse, PartyPopper, TrendingUp, TrendingDown, Minus } from "lucide-react";
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

// signal for "improving" (the app's primary accent, no special alarm
// needed for good news), ember for "declining" (the app's secondary
// accent, reserved app-wide for things that deserve emphasis/attention) --
// same accent-reuse convention as the loops/correlation/question badges
// below, not a new color introduced just for this.
const MOOD_TREND_META = {
  improving: { label: "Improving", Icon: TrendingUp, className: "text-signal" },
  declining: { label: "Declining", Icon: TrendingDown, className: "text-ember" },
  steady: { label: "Steady", Icon: Minus, className: "text-ink/60" },
  insufficient: { label: "Not enough data yet", Icon: Minus, className: "text-ink/40" },
};

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

  const hasAnalysis = Boolean(data?.analysisSource) && data.analysisSource !== "none";
  const confidencePct = hasAnalysis && Number.isFinite(data?.confidence) ? Math.round(data.confidence * 100) : null;

  // Best/hardest single day within the same six-month window the heatmap
  // already renders -- purely computed client-side from moodHeatmap (no
  // backend change needed), a second, more specific way of reading the
  // same underlying data the heatmap and mood balance already show in
  // aggregate. Ties broken toward the more recent date. Requires a handful
  // of different logged days before naming an "extreme" out of them.
  const dayExtremes = useMemo(() => {
    // Same HEATMAP_DAYS trailing window MoodHeatmap itself renders --
    // moodHeatmap from the API isn't date-bounded (see
    // server/src/modules/retrospect/routes.js), so without this filter the
    // "best/hardest day, this window" callouts could point at a day from
    // outside the six-month grid actually shown above them.
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - HEATMAP_DAYS);
    const rows = (data?.moodHeatmap || []).filter((r) => r.mood && r.rawDate && new Date(r.rawDate) >= windowStart);
    if (rows.length < 5) return null;
    const scored = rows.map((r) => ({ ...r, score: moodToScore(r.mood) }));
    const best = scored.reduce((a, b) => (b.score > a.score || (b.score === a.score && b.date > a.date) ? b : a));
    const worst = scored.reduce((a, b) => (b.score < a.score || (b.score === a.score && b.date > a.date) ? b : a));
    if (best.date === worst.date) return null;
    return { best, worst };
  }, [data?.moodHeatmap]);

  // Previously one lead AI question (socraticQuestion) with a smaller,
  // visually secondary list of computed ones (reflectivePrompts) tucked
  // below it. Flattened into one equal-weight list so every question gets
  // the same card treatment and its own "Continue" action -- "source"
  // just changes the icon tint, not the size or prominence.
  const reflectionQuestions = useMemo(() => {
    const list = [];
    if (data?.socraticQuestion) list.push({ text: data.socraticQuestion, source: "ai" });
    for (const q of data?.reflectivePrompts || []) list.push({ text: q, source: "pattern" });
    if (!list.length) list.push({ text: "What pattern feels most meaningful to reflect on next?", source: "ai" });
    return list;
  }, [data?.socraticQuestion, data?.reflectivePrompts]);

  // Previously the only loading feedback on this whole page was the literal
  // string "Analyzing entries..." in the pull-quote up top -- every chart
  // and card below it (heatmap, timeline, mood balance, recurring themes,
  // writing rhythm, behavioral loops) just rendered its own genuinely-empty
  // state at the same time, which read as a mostly-broken page rather than
  // one still waiting on a slower AI-backed analysis call. Matches the same
  // skeleton shape as Dashboard's.
  if (!data && !loadError) {
    return (
      <main className="ui-page">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="ui-card rounded-2xl p-5 space-y-2">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-6 w-40" />
            <div className="skeleton h-3 w-56" />
          </div>
          <div className="ui-quote py-1 space-y-2">
            <div className="skeleton h-3 w-32" />
            <div className="skeleton h-6 w-full max-w-lg" />
          </div>
          <div className="ui-card rounded-2xl p-4 grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="skeleton h-6 w-12" />
                <div className="skeleton h-2.5 w-16" />
              </div>
            ))}
          </div>
          <div className="ui-card-hero p-4 space-y-3">
            <div className="skeleton h-4 w-40" />
            <div className="skeleton h-40 w-full" />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="ui-card rounded-2xl p-4 lg:col-span-2 space-y-3">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-56 w-full" />
            </div>
            <div className="space-y-4">
              <div className="ui-card rounded-2xl p-4 space-y-3">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-24 w-full" />
              </div>
              <div className="ui-card rounded-2xl p-4 space-y-3">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-16 w-full" />
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

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
        {/* Page header -- previously this page jumped straight into the
            pull-quote below with no page-level heading at all, the one page
            among Dashboard/Health/Journal History/Settings/Year in Review
            that skipped .ui-title entirely. Same header-card shape Health
            uses right before its own pull-quote (kicker + ui-title +
            one-line description), for a consistent "here's the page, here's
            the headline finding" structure across every insights page. */}
        <motion.div variants={iVariants} className="ui-card rounded-2xl p-5">
          <p className="ui-kicker">Insights</p>
          <h2 className="ui-title mt-1">Retrospect</h2>
          <p className="text-sm text-ink/70 mt-2">
            Patterns across your mood, writing, and health
            {data?.timeline?.length ? `, built from your last ${data.timeline.length} entries.` : "."}
          </p>
        </motion.div>

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

        {/* Quick-stats strip -- previously dateRange, confidence, and
            analysisSource were all returned by the API and never shown
            anywhere, so there was no way to tell "this summary is from 20
            fresh AI-analyzed entries" apart from "this is a cached result
            from last week" or "there's no analysis yet." Grounds the
            headline sentence above in real, checkable numbers instead of
            asking for blind trust in it. */}
        <motion.div variants={iVariants} className="ui-card rounded-2xl p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="ui-hero-number text-2xl">{data?.timeline?.length ?? 0}</p>
              <p className="ui-kicker mt-1">Entries analyzed</p>
            </div>
            <div>
              <p className="text-base font-medium text-ink/90">{formatDateRange(data?.dateRange)}</p>
              <p className="ui-kicker mt-1">Date range</p>
            </div>
            <div className="flex items-center gap-3">
              {confidencePct !== null && <ConfidenceRing pct={confidencePct} />}
              <div>
                <p className="text-base font-medium text-ink/90">{sourceLabel(data?.analysisSource)}</p>
                <p className="ui-kicker mt-1">Analysis basis{confidencePct !== null ? ` · ${confidencePct}%` : ""}</p>
              </div>
            </div>
            {/* moodTrend -- real delta between the first and second half of
                the same window (see server/src/modules/retrospect/routes.js),
                not an AI impression -- "am I trending up or down" is one of
                the most basic retrospective questions and this page didn't
                answer it anywhere before. */}
            <div className="flex items-center gap-2">
              {(() => {
                const trend = MOOD_TREND_META[data?.moodTrend?.direction] || MOOD_TREND_META.insufficient;
                const { Icon } = trend;
                return <Icon size={18} className={`${trend.className} shrink-0`} />;
              })()}
              <div>
                <p className="text-base font-medium text-ink/90">
                  {(MOOD_TREND_META[data?.moodTrend?.direction] || MOOD_TREND_META.insufficient).label}
                </p>
                <p className="ui-kicker mt-1">Mood trend</p>
              </div>
            </div>
          </div>
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

          {/* Best/hardest single day within the same window this card
              already covers -- previously its own separate full-width row
              right below, which read as two back-to-back cards both about
              "which day, when" data. Nested here instead, behind a hairline
              divider (same convention the loops/correlation card below
              uses), so it reads as a detail of the calendar above it rather
              than a second, competing section. Clicking either reuses the
              same selectedDate/DayEntryPreview wiring the heatmap squares
              use, so the preview opens right above within the same card. */}
          {dayExtremes && (
            <div className="mt-4 pt-4 border-t border-ink/10 grid sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setSelectedDate(dayExtremes.best.date)}
                className="rounded-xl p-3 text-left hover:bg-ink/5 transition"
              >
                <p className="ui-kicker">Best day, this window</p>
                <p className="ui-hero-number text-2xl mt-1 capitalize" style={{ color: MOOD_COLOR[dayExtremes.best.mood] }}>
                  {dayExtremes.best.mood}
                </p>
                <p className="text-xs text-ink/50 mt-1">
                  {new Date(dayExtremes.best.rawDate || dayExtremes.best.date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  · click to read
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(dayExtremes.worst.date)}
                className="rounded-xl p-3 text-left hover:bg-ink/5 transition"
              >
                <p className="ui-kicker">Hardest day, this window</p>
                <p className="ui-hero-number text-2xl mt-1 capitalize" style={{ color: MOOD_COLOR[dayExtremes.worst.mood] }}>
                  {dayExtremes.worst.mood}
                </p>
                <p className="text-xs text-ink/50 mt-1">
                  {new Date(dayExtremes.worst.rawDate || dayExtremes.worst.date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  · click to read
                </p>
              </button>
            </div>
          )}
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
              {/* Previously uniform pills -- every theme read as equally
                  common regardless of whether it showed up once or eight
                  times. themeFrequency (new field, see
                  server/src/modules/retrospect/routes.js) carries the same
                  ranked themes with counts attached, so this can be a real
                  ranked bar list instead, same visual language as Mood
                  balance above it. */}
              <ThemeFrequency themes={data?.themeFrequency || []} />
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

        {/* moodByWeekday -- new field (see server/src/modules/retrospect/
            routes.js), average mood score per day of week rather than a
            simple entry count. Writing rhythm above already answers "when
            do you write" -- this answers the different, more retrospective
            question of "how do you tend to feel" on a given day, colored
            with the same SCORE_COLOR palette as the emotional timeline bars
            so a glance at either chart reads the same way. */}
        <motion.div variants={iVariants} className="ui-card rounded-2xl p-4">
          <h3 className="font-medium">Mood by weekday</h3>
          <p className="text-xs text-ink/60 mt-1">Average tone, by day of week.</p>
          <MoodByWeekday weekday={data?.moodByWeekday} />
        </motion.div>

        {/* Previously one card with plain icons and hairline dividers --
            three facets of the same analysis, but visually indistinguishable
            from a settings list. Now each gets its own tinted icon badge
            (same rounded-full bg-COLOR/15 border-COLOR/30 convention as
            StreakMilestone/MoodGlobeLauncher elsewhere in the app), reusing
            the app's two existing accents rather than inventing new colors:
            signal for the two observational facets, ember (reserved for
            emphasis app-wide) for the one with the actual call to action. */}
        <motion.div variants={iVariants} className="grid sm:grid-cols-2 gap-4">
          <div className="ui-card rounded-2xl p-4">
            <div className="flex items-center gap-2.5">
              <span className="h-9 w-9 rounded-full bg-signal/15 border border-signal/30 flex items-center justify-center shrink-0">
                <Repeat size={16} className="text-signal" />
              </span>
              <p className="ui-kicker">Behavioral loops</p>
            </div>
            <p className="text-sm text-ink/80 mt-3">
              {(data?.behavioralLoops || []).join(" • ") || "Not enough entries yet to detect a loop."}
            </p>
          </div>
          <div className="ui-card rounded-2xl p-4">
            <div className="flex items-center gap-2.5">
              <span className="h-9 w-9 rounded-full bg-signal/15 border border-signal/30 flex items-center justify-center shrink-0">
                <HeartPulse size={16} className="text-signal" />
              </span>
              <p className="ui-kicker">Health correlation</p>
            </div>
            <p className="text-sm text-ink/80 mt-3">{data?.healthCorrelation || "No correlation data yet."}</p>
          </div>
        </motion.div>

        {/* Previously one lead AI question (socraticQuestion) with a
            visually smaller, secondary list of computed ones tucked below
            it. Flattened into one set of equal-weight cards -- every
            question gets the same size and its own "Continue" button;
            "source" only changes the icon tint (ember for the AI-generated
            one, signal for the ones templated from a real computed pattern
            -- see reflectivePrompts in server/src/modules/retrospect/
            routes.js), not which one looks more important. */}
        <motion.div variants={iVariants}>
          <p className="ui-kicker mb-2">Reflect further</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {reflectionQuestions.map((q, i) => (
              <div key={i} className="ui-card rounded-2xl p-4 flex flex-col">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 border ${
                      q.source === "ai" ? "bg-ember/15 border-ember/30" : "bg-signal/15 border-signal/30"
                    }`}
                  >
                    <HelpCircle size={16} className={q.source === "ai" ? "text-ember" : "text-signal"} />
                  </span>
                  <p className="ui-kicker">{q.source === "ai" ? "From your recent entries" : "From a pattern"}</p>
                </div>
                <p className="text-ink/90 mt-3 flex-1">{q.text}</p>
                <button
                  type="button"
                  className="mt-3 px-4 py-2 min-h-11 ui-button-primary self-start"
                  onClick={() => navigate("/chat", { state: { prefill: q.text } })}
                >
                  Continue reflection
                </button>
              </div>
            ))}
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

// Same ranked-bar treatment as MoodBalance above -- length encodes count
// directly, and the list is already sorted most-to-least frequent server
// side, so reading top-to-bottom IS reading in frequency order.
function ThemeFrequency({ themes }) {
  if (!themes.length) {
    return <p className="text-xs text-ink/50">Not enough entries yet to detect a recurring theme.</p>;
  }
  const max = Math.max(1, ...themes.map((t) => t.count));
  return (
    <div className="space-y-2.5">
      {themes.map((t) => (
        <div key={t.theme} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-ink/70 capitalize truncate">{t.theme.replace(/_/g, " ")}</span>
          <div className="ui-bar-track flex-1 h-2 rounded-full bg-ink/8 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(6, (t.count / max) * 100)}%`,
                background:
                  "linear-gradient(180deg, rgb(255 255 255 / 0.35), rgb(255 255 255 / 0) 65%), rgb(var(--signal))",
              }}
            />
          </div>
          <span className="w-6 shrink-0 text-right text-xs text-ink/55 ui-mono">{t.count}</span>
        </div>
      ))}
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
  // byWeekday was already computed and sent by the backend (see
  // writingRhythm in server/src/modules/retrospect/routes.js) purely to
  // drive the "especially on Tuesdays" sentence above -- the actual
  // Sun-Sat breakdown behind that sentence was never rendered anywhere.
  // Same bar treatment as the time-of-day buckets, just seven narrower
  // columns instead of four.
  const maxWeekday = Math.max(1, ...(rhythm.byWeekday || []).map((d) => d.count));
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

      {rhythm.byWeekday?.length > 0 && (
        <div className="mt-5">
          <p className="ui-kicker">By weekday</p>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {rhythm.byWeekday.map((d) => (
              <div key={d.label} className="text-center">
                <div className="h-10 flex items-end justify-center">
                  <div
                    className="w-full max-w-[14px] rounded-t-md transition-all"
                    style={{
                      height: `${Math.max(8, (d.count / maxWeekday) * 100)}%`,
                      background:
                        d.label === rhythm.dominantWeekday
                          ? "linear-gradient(90deg, rgb(255 255 255 / 0.25), rgb(255 255 255 / 0) 55%), rgb(var(--signal))"
                          : "rgb(var(--ink) / 0.15)",
                    }}
                    title={`${d.label}: ${d.count} ${d.count === 1 ? "entry" : "entries"}`}
                  />
                </div>
                <p className="text-[9px] text-ink/45 mt-1">{d.label[0]}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateRange(range) {
  if (!range?.from || !range?.to) return "Not enough entries yet";
  const opts = { month: "short", day: "numeric" };
  const from = new Date(range.from).toLocaleDateString(undefined, opts);
  const to = new Date(range.to).toLocaleDateString(undefined, opts);
  return from === to ? from : `${from} – ${to}`;
}

// analysisSource comes straight from the backend's own provider name (see
// getOrRefreshRetrospectAnalysis/runGeneration in
// server/src/modules/retrospect/service.js) -- "ollama"/"gemini"/"openai"
// for a fresh AI generation, "heuristic" for the honest non-AI fallback,
// "cached" for a still-fresh earlier result, "none" for a brand-new
// account. Collapsed to plain language here since none of those internal
// provider names mean anything to someone reading this page.
function sourceLabel(source) {
  if (source === "ollama" || source === "gemini" || source === "openai") return "AI-generated";
  if (source === "cached") return "From your last analysis";
  if (source === "heuristic") return "Computed from your entries";
  return "Not enough entries yet";
}

// Plain SVG ring (stroke-dasharray trick), not a chart library -- this is
// one number, not a dataset, so a whole Recharts RadialBarChart would be a
// lot of weight for what a dozen lines of SVG already does.
function ConfidenceRing({ pct }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0 -rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgb(var(--ink) / 0.1)" strokeWidth="4" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="rgb(var(--signal))"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

// Same 7-column bar shape as WritingRhythm's weekday chart, but height
// encodes average mood score and color encodes the dominant (most-felt)
// mood for that weekday, rather than entry count -- a genuinely different
// question ("how do you tend to feel" vs "when do you write"), so it gets
// its own card rather than folding into that one.
function MoodByWeekday({ weekday }) {
  if (!weekday?.eligible) {
    return (
      <p className="text-xs text-ink/50 mt-4">
        Not enough entries yet across enough different days to show a weekday pattern.
      </p>
    );
  }
  return (
    <div className="mt-3">
      {(weekday.bestWeekday || weekday.worstWeekday) && (
        <p className="text-sm text-ink/80">
          {weekday.bestWeekday && (
            <>
              Best tends to be <span className="font-medium text-ink">{weekday.bestWeekday}</span>
            </>
          )}
          {weekday.bestWeekday && weekday.worstWeekday && ", "}
          {weekday.worstWeekday && (
            <>
              hardest tends to be <span className="font-medium text-ink">{weekday.worstWeekday}</span>
            </>
          )}
          .
        </p>
      )}
      <div className="mt-4 grid grid-cols-7 gap-2">
        {weekday.byWeekday.map((d) => (
          <div key={d.label} className="text-center">
            <div className="h-16 flex items-end justify-center">
              {d.avgScore !== null ? (
                <div
                  className="w-full max-w-[24px] rounded-t-md transition-all"
                  style={{
                    height: `${Math.max(8, (d.avgScore / 5) * 100)}%`,
                    // Colored by the mood most often actually felt on this
                    // weekday (dominantMood), not the rounded average score
                    // -- averaging several different moods into one 0-5
                    // number tends to land every day in the same murky
                    // middle bucket, so every bar came out the same color
                    // even when the days felt very different. Height still
                    // carries the average (how good/bad, on the whole);
                    // color now carries which specific emotion actually
                    // showed up most.
                    background: MOOD_COLOR[d.dominantMood] || "rgb(var(--signal))",
                  }}
                  title={`${d.label}: mostly ${d.dominantMood || "reflective"} (${d.count} ${d.count === 1 ? "entry" : "entries"})`}
                />
              ) : (
                <div className="w-full max-w-[24px] h-1 rounded-t-md bg-ink/10" title={`${d.label}: no entries yet`} />
              )}
            </div>
            <p className="text-[10px] text-ink/55 mt-1.5">{d.label.slice(0, 3)}</p>
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
