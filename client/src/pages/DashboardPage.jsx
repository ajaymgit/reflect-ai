import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Flame, Gem } from "lucide-react";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { apiFetch, describeError } from "../api";
import AnimatedNumber from "../components/AnimatedNumber";
import MoodCalendar from "../components/MoodCalendar";
import KeepsakesLauncher from "../components/MoodGlobeLauncher";
import { EntryModalById } from "../components/EntryModal";
import FirstTimeTip from "../components/FirstTimeTip";
import StreakMilestone from "../components/StreakMilestone";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";
import { MOOD_HEX } from "../utils/moodColors";

const moodDotColor = MOOD_HEX;

// Previously a "quick actions" strip duplicated every sidebar destination
// (Journal history, Retrospect, Year in review, Health, Reflect with AI) as
// a second row of the exact same links, right below the hero -- the same
// five destinations twice on one screen, just styled differently. The
// sidebar nav is always visible on desktop and covers all of this already;
// this row wasn't adding a real capability, just repeating the nav back to
// the person looking at it. Removed rather than reworked -- Home doesn't
// need to also be a nav.

// Staggered entrance for the sections below -- previously every other page
// that got a real graph/chart pass (Retrospect, Health) also picked up real
// motion along the way, while Dashboard stayed a flat, instant snap-in.
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};
// prefers-reduced-motion equivalents -- same variant shape (so every
// motion.div below can keep using the same variants prop unconditionally)
// but resolved to an instant, no-slide state instead of stripping the
// animation library out entirely.
const staticContainerVariants = { hidden: {}, visible: {} };
const staticItemVariants = { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } };

// Minimal "financial-app sparkline" -- no axes, no gridlines, no tooltip
// chrome, just the shape of the last 14 days under the headline number it
// belongs to, backed by GET /api/dashboard/summary's `wellnessTrend` field.
function WellnessSparkline({ trend }) {
  const hasAnyData = (trend || []).some((t) => Number.isFinite(t.score));
  if (!hasAnyData) return null;
  return (
    <div className="h-14 mt-3 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="wellness-spark-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="rgb(var(--signal))" stopOpacity={0.5} />
              <stop offset="95%" stopColor="rgb(var(--signal))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis domain={[30, 100]} hide />
          <Tooltip
            cursor={{ stroke: "rgb(var(--ink) / 0.25)" }}
            contentStyle={{ background: "rgb(var(--paper-raised))", border: "1px solid rgb(var(--ink) / 0.15)", borderRadius: 8, fontSize: 11 }}
            labelFormatter={(v) => new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            formatter={(value) => [value ?? "--", "Wellness"]}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="rgb(var(--signal))"
            strokeWidth={2}
            fill="url(#wellness-spark-grad)"
            connectNulls
            dot={false}
            activeDot={{ r: 3 }}
            animationDuration={600}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Circular progress ring for the wellness score -- researched against how
// Oura and Whoop present their own single daily 0-100 score (Readiness /
// Recovery): both frame it as a simple circular dial someone reads at a
// glance, not a bare number sitting in a text column. This is exactly the
// same shape of data (one daily score, meant for an at-a-glance check), so
// the ring treatment carries over directly. The ring always maps the full
// 0-100 range even though the score's real floor/ceiling is 35-95 (see
// wellnessFromStress in dashboard/routes.js) -- matching how Oura/Whoop
// actually draw their rings against the full scale, not the score's own
// clamped range, since a ring that could never visually empty or fill
// would just read as broken rather than "healthy."
function WellnessRing({ score, reducedMotion }) {
  const size = 104;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const hasScore = Number.isFinite(score);
  const pct = hasScore ? Math.max(0, Math.min(100, score)) : 0;
  const offset = circumference * (1 - pct / 100);
  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--ink) / 0.08)" strokeWidth={stroke} />
        {hasScore && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgb(var(--ember))"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={reducedMotion ? undefined : { transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="ui-hero-number text-3xl text-accent-ember">
          <AnimatedNumber value={hasScore ? score : "--"} />
        </p>
      </div>
    </div>
  );
}

// "2h ago" / "Yesterday" / "Mon" / "Mar 4" -- previously every recent-entry
// row showed the same absolute date regardless of recency.
function relativeDay(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffH = (now - date) / (1000 * 60 * 60);
  if (diffH < 1) return "Just now";
  if (diffH < 24 && date.getDate() === now.getDate()) return `${Math.round(diffH)}h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  const diffDays = Math.floor(diffH / 24);
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Reuses GET /api/dashboard/summary's existing `quickHealthSummary` field
// (averageSleep/averageSteps/averageStress) -- that data was already being
// fetched and sent to the client, just never rendered anywhere. No new
// endpoint needed for this widget. Bigger hero-scale numbers now (was a
// generic text-lg stat row indistinguishable from any other card's body
// text) plus a one-line read on the numbers, not just the raw figures --
// the point is to actually answer "how am I doing" without a click, not
// just relocate the Health page's numbers one level up.
function HealthSnapshotCard({ summary, hasData, onLogged }) {
  const stressRead =
    summary?.averageStress == null
      ? null
      : summary.averageStress >= 65
        ? "Stress has been running high this week."
        : summary.averageStress >= 40
          ? "Stress has been moderate this week."
          : "Stress has been low this week -- good sign.";
  return (
    <div className="ui-card rounded-2xl p-5 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <p className="ui-kicker">Health snapshot</p>
        <Link to="/health" className="text-xs text-ink/50 hover:text-ink/80 inline-flex items-center gap-1">
          Full page <ArrowRight size={11} />
        </Link>
      </div>
      {hasData ? (
        <>
          {/* gap-x-4 -- previously relied only on the next column's
              border-l+pl-4 for separation, with zero actual track gap. Fine
              for short values, but a real 4-digit steps average (e.g. 8200)
              at this text-3xl size visually runs into the neighboring
              stress score with no gap at all (e.g. "8200"+"43" reading as
              "820043") -- an explicit gap gives every column real breathing
              room regardless of how wide its content gets. */}
          <div className="grid grid-cols-3 mt-4 gap-x-4">
            <div>
              <p className="ui-hero-number text-3xl">{summary.averageSleep || "--"}</p>
              <p className="text-[11px] text-ink/60 mt-1">avg hrs sleep</p>
            </div>
            <div className="border-l border-ink/10 pl-4">
              <p className="ui-hero-number text-3xl">{summary.averageSteps || "--"}</p>
              <p className="text-[11px] text-ink/60 mt-1">avg steps</p>
            </div>
            <div className="border-l border-ink/10 pl-4">
              <p className="ui-hero-number text-3xl">{summary.averageStress || "--"}</p>
              <p className="text-[11px] text-ink/60 mt-1">stress score</p>
            </div>
          </div>
          {stressRead && <p className="text-sm text-ink/70 mt-4 leading-snug">{stressRead}</p>}
        </>
      ) : (
        <>
          {/* Previously just a one-line "No health data yet" sentence,
              which left this whole card mostly blank inside a two-up grid
              (h-full stretches it to match the Retrospect card next to it,
              which has real ranked-bar content filling that same height).
              A quick-log form actually usable right here -- same POST
              /api/health-data/manual-entry the full Health page's own form
              hits -- turns that dead space into the one action that fixes
              it: log a number, watch this card (and the wellness ring
              above) fill in on the next load, no navigation required. */}
          <p className="text-sm text-ink/50 mt-3">
            No health data yet -- log today's numbers below, or head to the{" "}
            <Link to="/health" className="text-ink/70 underline underline-offset-2 hover:text-ink">
              full Health page
            </Link>
            .
          </p>
          <div className="mt-4 flex-1 flex flex-col justify-center">
            <QuickLogHealthForm onSaved={onLogged} />
          </div>
        </>
      )}
    </div>
  );
}

// Compact counterpart to HealthPage's own LogHealthDataForm -- same fields,
// same endpoint, same "any single value is enough" behavior, just stacked
// vertically to fit this card's narrower column instead of that page's
// full-width four-up row. Existing purely so the empty state above has a
// real action in it instead of only a link elsewhere.
function QuickLogHealthForm({ onSaved }) {
  const [steps, setSteps] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function save(e) {
    e.preventDefault();
    if (saving) return;
    const body = {};
    if (steps !== "") body.steps = Number(steps);
    if (sleepHours !== "") body.sleepHours = Number(sleepHours);
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
      setStatus("Saved");
      onSaved?.();
    } catch (err) {
      setStatus(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-ink/60">
          Steps
          <input
            type="number"
            min="0"
            className="ui-input mt-1 text-sm"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder="8000"
          />
        </label>
        <label className="text-[11px] text-ink/60">
          Sleep (hrs)
          <input
            type="number"
            min="0"
            max="24"
            step="0.1"
            className="ui-input mt-1 text-sm"
            value={sleepHours}
            onChange={(e) => setSleepHours(e.target.value)}
            placeholder="7.5"
          />
        </label>
      </div>
      <button type="submit" disabled={saving} className="px-3 py-2 min-h-9 text-sm ui-button-primary whitespace-nowrap">
        {saving ? "Saving..." : "Log today"}
      </button>
      {status && (
        <p
          role={status === "Saved" ? "status" : "alert"}
          className={`text-xs ${status === "Saved" ? "text-ember-soft" : "text-red-300"}`}
        >
          {status}
        </p>
      )}
    </form>
  );
}

const MOOD_COLOR = MOOD_HEX;

// Teaser for the Retrospect page -- backed by its own GET
// /api/retrospect/analysis (a separate, lightweight request; the endpoint
// caches its AI-generated analysis for 12h server-side, so this doesn't
// trigger a fresh Ollama call on every Dashboard load). Now carries a real
// mood-balance mini-chart (same ranked-bar data Retrospect's own page
// shows), not just a summary sentence + theme chips -- the actual point of
// a "condensed version on the home page" is real numbers you can read
// without a click, not a better-written link.
function RetrospectPreviewCard({ retro }) {
  const distribution = retro?.moodCounts
    ? Object.entries(retro.moodCounts)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
    : [];
  const topCount = distribution[0]?.[1] || 1;
  return (
    <div className="ui-card rounded-2xl p-5 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <p className="ui-kicker">Retrospect</p>
        <Link to="/retrospect" className="text-xs text-ink/50 hover:text-ink/80 inline-flex items-center gap-1">
          Full page <ArrowRight size={11} />
        </Link>
      </div>
      <p className="text-sm text-ink/80 mt-3 leading-snug">
        {retro?.emotionalPatternSummary || "Write a few more entries to unlock pattern analysis."}
      </p>
      {distribution.length > 0 && (
        <div className="mt-4 space-y-2">
          {distribution.map(([mood, count]) => (
            <div key={mood} className="flex items-center gap-2.5">
              <span className="w-16 shrink-0 text-xs text-ink/70 capitalize">{mood}</span>
              <div className="ui-bar-track flex-1 h-1.5 rounded-full bg-ink/8 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(6, (count / topCount) * 100)}%`,
                    background: `linear-gradient(180deg, rgb(255 255 255 / 0.35), rgb(255 255 255 / 0) 65%), ${MOOD_COLOR[mood] || "rgb(var(--signal))"}`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {retro?.recurringThemes?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {retro.recurringThemes.slice(0, 4).map((t) => (
            <span key={t} className="text-[10px] px-2 py-1 rounded-full bg-ink/8 text-ink/55 capitalize">
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Real home-screen makeover, not another pass over the same three cards --
// previously Home was a single narrow column (hero, mood calendar, recent
// entries) capped at max-w-3xl, noticeably thinner in both content and
// layout than Health/Retrospect once those got their chart passes. This
// widens to the same max-w-6xl footprint, adds a quick-actions row into
// every other feature (previously reachable only via nav), and pulls in real
// previews of Health and Retrospect data that were either unused
// (quickHealthSummary/retrospectAlert were already being sent by
// /api/dashboard/summary and never rendered) or a quick extra fetch
// (/api/retrospect/analysis).
export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [retro, setRetro] = useState(null);
  const [range] = useState("week");
  const [entryLimit, setEntryLimit] = useState(6);
  const [entryFilter, setEntryFilter] = useState("all");
  const [openEntryId, setOpenEntryId] = useState(null);
  const reducedMotion = usePrefersReducedMotion();
  const cVariants = reducedMotion ? staticContainerVariants : containerVariants;
  const iVariants = reducedMotion ? staticItemVariants : itemVariants;

  function loadSummary() {
    // tzOffset: the browser's own getTimezoneOffset() (minutes to add to
    // local time to reach UTC) -- lets the server bucket the streak and
    // "today" by this person's actual calendar day instead of the
    // server's, which previously could disagree near midnight.
    setLoadError(false);
    return apiFetch(`/api/dashboard/summary?range=${range}&tzOffset=${new Date().getTimezoneOffset()}`)
      .then(setData)
      // Previously swallowed entirely -- a failed load here left every card
      // on the home page (streak, mood, health snapshot, recent entries) in
      // its normal "genuinely no data yet" empty state, indistinguishable
      // from a real network/server failure. This is the first page anyone
      // sees after logging in, so it's worth a visible retry instead of a
      // silently-empty home screen.
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    apiFetch("/api/retrospect/analysis")
      .then(setRetro)
      .catch(() => {});
  }, []);

  // Was 3/5/7 -- previously "recent entries" meant an almost-full second
  // copy of the archive (mood legend row, filter chips, up to 7 full entry
  // rows) sitting on the home screen, which is what History already is.
  // Capped lower now so this reads as a preview of what's newest, not a
  // second, slightly-worse History page bolted under the fold.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 640) {
        setEntryLimit(3);
      } else {
        setEntryLimit(4);
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toneMood = ["happy", "calm", "reflective", "sad", "stressed", "angry"].includes(data?.todaysMood)
    ? data.todaysMood
    : "reflective";
  const moodClass = `mood-${toneMood}`;

  // This is the first page anyone sees after logging in, and previously had
  // no loading state at all -- summary fetch takes a beat on a cold Render
  // instance, during which every field on this page (`data?.foo || 0`-style
  // fallbacks throughout) rendered its own "no data yet" empty/zero state
  // simultaneously, which read as a flash of broken content rather than a
  // page that's still loading. A skeleton matching the real layout (same
  // shape JournalHistoryPage and YearInReviewPage already use) makes that
  // beat read as "loading," not "empty."
  if (!data && !loadError) {
    return (
      <main className="p-4 md:p-6 living-bg">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="ui-card-hero p-6 md:p-7 space-y-3">
            <div className="skeleton h-3 w-28" />
            <div className="skeleton h-7 w-72 max-w-full" />
            <div className="skeleton h-4 w-full max-w-md" />
            <div className="flex gap-3 mt-2">
              <div className="skeleton h-11 w-32 rounded-lg" />
              <div className="skeleton h-11 w-40 rounded-lg" />
            </div>
          </div>
          <div className="ui-card rounded-2xl p-4 space-y-2.5">
            <div className="skeleton h-3 w-56" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="ui-card rounded-2xl p-5 space-y-3">
              <div className="skeleton h-4 w-36" />
              <div className="skeleton h-40 w-full" />
            </div>
            <div className="ui-card rounded-2xl p-5 space-y-3">
              <div className="skeleton h-4 w-36" />
              <div className="skeleton h-40 w-full" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`p-4 md:p-6 living-bg ${moodClass}`}>
      <motion.div
        className="max-w-6xl mx-auto space-y-4"
        variants={cVariants}
        initial="hidden"
        animate="visible"
      >
        {loadError && (
          <motion.div
            variants={iVariants}
            className="ui-card rounded-2xl p-4 border-ember/30 flex items-center justify-between gap-3 flex-wrap"
          >
            <p className="text-sm text-ink/80">Couldn't load your dashboard data. This may just be a connection hiccup.</p>
            <button type="button" onClick={loadSummary} className="text-sm text-signal hover:text-signal-soft font-medium shrink-0">
              Try again
            </button>
          </motion.div>
        )}
        {/* .ui-card-hero (wider radius) instead of .ui-card -- this is the
            one card on the page someone should register as "the main
            event" before anything else, so it gets the app's biggest-radius
            tier instead of matching every other card's rounded-2xl. */}
        <motion.div variants={iVariants} className="ui-card-hero p-6 md:p-7">
          <div className="grid lg:grid-cols-[1fr_auto] gap-6">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="ui-kicker">{data?.greeting || "Welcome back"}</p>
                  <h2 className="ui-title mt-1">How are you feeling today?</h2>
                </div>
                {data?.journalingStreak > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-ink/55 text-sm shrink-0 lg:hidden">
                    <Flame size={14} />
                    {data.journalingStreak} day streak
                  </span>
                )}
              </div>

              {/* Same missing-track-gap issue as HealthSnapshotCard above --
                  smaller text-lg font makes this one far less likely to
                  actually collide, but a real gap costs nothing and keeps
                  the pattern consistent instead of leaving a second copy of
                  the same latent bug in place. */}
              <div className="grid grid-cols-3 mt-6 mb-2 gap-x-4">
                <div>
                  <p className="text-lg font-medium capitalize flex items-center gap-1.5">
                    {data?.todaysMood && moodDotColor[data.todaysMood] && (
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: moodDotColor[data.todaysMood] }} />
                    )}
                    {data?.todaysMood ?? "--"}
                  </p>
                  <p className="text-xs text-ink/60 mt-0.5">mood</p>
                </div>
                <div className="border-l border-ink/10 pl-4">
                  <p className="text-lg font-medium">
                    <AnimatedNumber value={data?.entriesInRange ?? "--"} />
                  </p>
                  <p className="text-xs text-ink/60 mt-0.5">entries this week</p>
                </div>
                <div className="border-l border-ink/10 pl-4">
                  <p className="text-lg font-medium">
                    <AnimatedNumber value={data?.journalingStreak ?? "--"} />
                  </p>
                  <p className="text-xs text-ink/60 mt-0.5">day streak</p>
                </div>
              </div>

              <p className="text-sm text-ink/70 mt-4 mb-4">{data?.cumulativeInsight || "Building your insight..."}</p>

              <div className="flex gap-2 flex-wrap">
                <Link to="/journal/new" className="inline-flex px-4 py-2.5 min-h-11 text-sm ui-button-primary">
                  Write journal
                </Link>
                <Link to="/chat" className="inline-flex px-5 py-3 min-h-11 text-base ui-button-ghost">
                  Continue reflection
                </Link>
              </div>
            </div>

            {/* Wellness score moved beside the greeting on wide screens
                (its own visual column, streak folded in above it) instead of
                always being a full-width band -- makes better use of the
                extra horizontal room now that Home matches the rest of the
                app's max-w-6xl footprint. */}
            <div className="lg:w-56 lg:border-l lg:border-ink/10 lg:pl-6 pt-6 lg:pt-0 border-t lg:border-t-0 border-ink/10">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-ink/60 uppercase tracking-wide">Wellness score</p>
                {data?.journalingStreak > 0 && (
                  <span className="hidden lg:inline-flex items-center gap-1 text-ink/60 text-[11px]">
                    <Flame size={12} />
                    {data.journalingStreak}d
                  </span>
                )}
              </div>
              {/* Previously this just showed a bare "--" forever for anyone
                  without health data synced -- which, without the Apple
                  Health companion app connected, was effectively everyone.
                  Now it says why, with a direct link to where that's fixed
                  (Health's new manual "Log today's data" form). */}
              {data && data.dailyWellnessScore == null ? (
                <div className="mt-1">
                  <p className="text-sm text-ink/50">No health data yet</p>
                  <Link to="/health" className="text-xs text-ink/60 hover:text-ink/85 underline underline-offset-2">
                    Log today's numbers
                  </Link>
                </div>
              ) : (
                <>
                  <div className="mt-2">
                    <WellnessRing score={data?.dailyWellnessScore} reducedMotion={reducedMotion} />
                  </div>
                  <WellnessSparkline trend={data?.wellnessTrend || []} />
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* Surfaces GET /api/dashboard/summary's `retrospectAlert` field --
            already being sent by the server, previously never rendered
            anywhere on the client. A one-line nudge toward the feature
            someone is either ready for or still building toward. */}
        {data?.retrospectAlert && (
          <motion.div
            variants={iVariants}
            className="ui-card rounded-2xl px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap"
          >
            <p className="text-sm text-ink/75">{data.retrospectAlert}</p>
            <Link to="/retrospect" className="text-xs text-ink/50 hover:text-ink/80 shrink-0 inline-flex items-center gap-1">
              Open Retrospect <ArrowRight size={12} />
            </Link>
          </motion.div>
        )}

        {/* Mood Calendar is inherently tall (a full month grid plus a rose
            chart plus consistency/dominant-mood callouts, in its own
            internal two-column layout) -- previously it shared a row with a
            three-card sidebar stack that's nowhere near as tall, which left
            a large empty gap under the short column once the tall one kept
            going. Full width of its own avoids that mismatch instead of
            trying to force the sidebar to be exactly as tall. */}
        <motion.div variants={iVariants} className="ui-card rounded-2xl p-5">
          <MoodCalendar />
        </motion.div>

        {/* Keepsakes gets its own full-width band with a distinct ember
            accent border instead of sharing a row with Health/Retrospect --
            those two are data previews (a reason to click through), this is
            a different kind of thing (an experience to open), and matching
            them box-for-box in a 3-up grid was exactly why it used to read
            as just another disabled-looking teaser instead of its own
            feature. */}
        <motion.div variants={iVariants} className="space-y-2">
          <KeepsakesLauncher variant="feature" />
          <FirstTimeTip id="dashboard-keepsakes-globe">
            Keepsakes are entries you've chosen to flag as worth revisiting -- open this to see them float by.
          </FirstTimeTip>
        </motion.div>

        {/* Health + Retrospect side by side -- both are real condensed data
            (hero-scale numbers, a mood-balance mini-chart), not link
            teasers, so someone can actually read "how am I doing" without
            leaving Home. */}
        <div className="grid md:grid-cols-2 gap-4">
          <motion.div variants={iVariants} className="h-full">
            <HealthSnapshotCard
              summary={data?.quickHealthSummary}
              // dailyWellnessScore is null exactly when the server found
              // zero HealthData rows in range (see dashboard/routes.js) --
              // the correct "has any data" signal, unlike checking whether
              // the averages themselves are truthy (a week that genuinely
              // averages to 0 steps/sleep/stress -- a real, if rare,
              // possibility -- would otherwise misread as "no data yet"
              // and show the quick-log form over real numbers).
              hasData={data?.dailyWellnessScore != null}
              onLogged={loadSummary}
            />
          </motion.div>
          <motion.div variants={iVariants} className="h-full">
            <RetrospectPreviewCard retro={retro} />
          </motion.div>
        </div>

        <motion.div variants={iVariants}>
            <div className="ui-card rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium">Recent entries</h3>
                <div className="flex items-center gap-4 shrink-0">
                  <Link to="/journal/new?view=history" className="text-xs text-ink/50 hover:text-ink/80">
                    View all
                  </Link>
                  <Link to="/journal/new" className="text-xs text-ink/50 hover:text-ink/80">
                    Add new
                  </Link>
                </div>
              </div>

              {/* The six-mood legend row that used to sit here (every mood
                  name + dot, whether or not it appeared in these entries)
                  was pure chrome on a home-screen preview -- each entry row
                  below already carries its own mood dot + label, so this
                  wasn't adding information, just height. Removed. */}

              {/* Filter chips -- only shown once there's at least one
                  Keepsake among the recent entries, so accounts with none
                  yet don't see a filter that would always show "no
                  results." Filters client-side over the already-fetched
                  list (capped at 8 by the server), not a new request. */}
              {(data?.recentEntries || []).some((e) => e.isKeepsake) && (
                <div className="flex items-center gap-2 mt-3">
                  {[
                    { id: "all", label: "All" },
                    { id: "keepsake", label: "Keepsakes" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setEntryFilter(f.id)}
                      aria-pressed={entryFilter === f.id}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] transition ${
                        entryFilter === f.id
                          ? "border-ink/40 bg-ink/10 text-ink"
                          : "border-ink/10 bg-ink/5 text-ink/50 hover:text-ink/75"
                      }`}
                    >
                      {f.id === "keepsake" && <Gem size={10} className="text-[#e8ab5f]" />}
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Card grid instead of a stack of thin list rows -- a list of
                  hairline-divided rows is a hard shape to scan (title,
                  excerpt, tags and timestamp all packed onto one line vying
                  for the same sliver of height); a grid of small cards gives
                  each entry actual room, matches the pattern History already
                  uses for the exact same data, and reads as a set of things
                  to pick from rather than a log to skim top-to-bottom.
                  Clicking a card opens it inline (EntryModalById -- fetches
                  the real content via GET /api/journal/:id, since this list
                  only ever has a truncated excerpt). */}
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                {(data?.recentEntries || [])
                  .filter((e) => entryFilter === "all" || e.isKeepsake)
                  .slice(0, entryLimit)
                  .map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setOpenEntryId(entry.id)}
                      className="ui-card rounded-2xl p-4 text-left hover:bg-ink/[0.03] transition space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-ink/60 capitalize">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: moodDotColor[entry.mood] || "rgb(var(--ink) / 0.2)" }}
                          />
                          {entry.mood}
                        </span>
                        <span className="text-[11px] text-ink/50 ui-mono shrink-0">{relativeDay(entry.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-sm truncate">{entry.title || "Untitled entry"}</p>
                        {entry.isKeepsake && <Gem size={11} className="text-[#e8ab5f] shrink-0" aria-label="Keepsake" />}
                      </div>
                      {entry.excerpt && <p className="text-sm text-ink/70 line-clamp-2">{entry.excerpt}</p>}
                      {(entry.tags || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {entry.tags.slice(0, 3).map((t) => (
                            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-ink/10 text-ink/60 ui-mono">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                {/* recentEntries is now sourced server-side from the actual
                    most recent entries regardless of date (see
                    dashboard/routes.js) -- it's empty here if and only if
                    hasAnyEntries is also false, so this no longer needs a
                    separate "wrote before, just not this week" branch. */}
                {(data?.recentEntries || []).length === 0 && (
                  <p className="text-sm text-ink/50 py-3 sm:col-span-2">No entries yet -- write your first one above.</p>
                )}
                {(data?.recentEntries || []).length > 0 &&
                  (data?.recentEntries || []).filter((e) => entryFilter === "all" || e.isKeepsake).length === 0 && (
                    <p className="text-sm text-ink/50 py-3 sm:col-span-2">No Keepsakes among your recent entries yet.</p>
                  )}
              </div>
            </div>
        </motion.div>
      </motion.div>

      {openEntryId && (
        <EntryModalById
          entryId={openEntryId}
          onClose={() => setOpenEntryId(null)}
          apiFetch={apiFetch}
          onUpdated={(updated) => {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    recentEntries: (prev.recentEntries || []).map((e) =>
                      e.id === updated._id
                        ? {
                            ...e,
                            title: updated.title,
                            mood: updated.mood,
                            tags: updated.tags,
                            isKeepsake: updated.isKeepsake,
                            excerpt: (updated.content || "").slice(0, 110),
                          }
                        : e,
                    ),
                  }
                : prev,
            );
          }}
          onDeleted={(id) => {
            setData((prev) =>
              prev ? { ...prev, recentEntries: (prev.recentEntries || []).filter((e) => e.id !== id) } : prev,
            );
          }}
        />
      )}

      <StreakMilestone streak={data?.journalingStreak} />
    </main>
  );
}
