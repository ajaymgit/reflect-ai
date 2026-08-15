import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Flame, Gem, HeartPulse, LineChart, MessageCircle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { apiFetch } from "../api";
import AnimatedNumber from "../components/AnimatedNumber";
import MoodCalendar from "../components/MoodCalendar";
import KeepsakesLauncher from "../components/MoodGlobeLauncher";
import { EntryModalById } from "../components/EntryModal";
import FirstTimeTip from "../components/FirstTimeTip";
import StreakMilestone from "../components/StreakMilestone";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";
import { MOOD_META, MOOD_HEX } from "../utils/moodColors";

const emotionMeta = MOOD_META;
const moodDotColor = MOOD_HEX;

// Every one of these already exists as its own full page -- previously
// Home had no way to jump straight to any of them except a single "Continue
// reflection" button to Chat. A real home screen for a multi-feature app
// surfaces its features, not just today's numbers.
const quickActions = [
  { to: "/journal/new?view=history", label: "Journal history", Icon: BookOpen },
  { to: "/retrospect", label: "Retrospect", Icon: LineChart },
  { to: "/year-in-review", label: "Year in review", Icon: Sparkles },
  { to: "/health", label: "Health", Icon: HeartPulse },
  { to: "/chat", label: "Reflect with AI", Icon: MessageCircle },
];

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
              <stop offset="5%" stopColor="#8fae73" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#8fae73" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis domain={[30, 100]} hide />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.2)" }}
            contentStyle={{ background: "#161f19", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 11 }}
            labelFormatter={(v) => new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            formatter={(value) => [value ?? "--", "Wellness"]}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#8fae73"
            strokeWidth={2}
            fill="url(#wellness-spark-grad)"
            connectNulls
            dot={false}
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
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
// endpoint needed for this widget.
function HealthSnapshotCard({ summary }) {
  const hasData = summary && (summary.averageSleep || summary.averageSteps || summary.averageStress);
  return (
    <div className="ui-card rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="ui-kicker">Health snapshot</p>
        <Link to="/health" className="text-xs text-white/50 hover:text-white/80 inline-flex items-center gap-1">
          Open <ArrowRight size={11} />
        </Link>
      </div>
      {hasData ? (
        <div className="flex mt-3">
          <div className="pr-5">
            <p className="text-lg font-medium">{summary.averageSleep || "--"}h</p>
            <p className="text-[11px] text-white/60 mt-1">avg sleep</p>
          </div>
          <div className="pl-5 pr-5 border-l border-white/10">
            <p className="text-lg font-medium">{summary.averageSteps || "--"}</p>
            <p className="text-[11px] text-white/60 mt-1">avg steps</p>
          </div>
          <div className="pl-5 border-l border-white/10">
            <p className="text-lg font-medium">{summary.averageStress || "--"}</p>
            <p className="text-[11px] text-white/60 mt-1">stress</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-white/50 mt-3">Sync health data to see a snapshot here.</p>
      )}
    </div>
  );
}

// Teaser for the Retrospect page -- backed by its own GET
// /api/retrospect/analysis (a separate, lightweight request; the endpoint
// caches its AI-generated analysis for 12h server-side, so this doesn't
// trigger a fresh Ollama call on every Dashboard load).
function RetrospectPreviewCard({ retro }) {
  return (
    <div className="ui-card rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="ui-kicker">Retrospect</p>
        <Link to="/retrospect" className="text-xs text-white/50 hover:text-white/80 inline-flex items-center gap-1">
          Open <ArrowRight size={11} />
        </Link>
      </div>
      <p className="text-sm text-white/80 mt-3 leading-snug">
        {retro?.emotionalPatternSummary || "Write a few more entries to unlock pattern analysis."}
      </p>
      {retro?.recurringThemes?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {retro.recurringThemes.slice(0, 4).map((t) => (
            <span key={t} className="text-[10px] px-2 py-1 rounded-full bg-white/8 text-white/55 capitalize">
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
  const [retro, setRetro] = useState(null);
  const [range] = useState("week");
  const [entryLimit, setEntryLimit] = useState(6);
  const [entryFilter, setEntryFilter] = useState("all");
  const [openEntryId, setOpenEntryId] = useState(null);
  const reducedMotion = usePrefersReducedMotion();
  const cVariants = reducedMotion ? staticContainerVariants : containerVariants;
  const iVariants = reducedMotion ? staticItemVariants : itemVariants;

  useEffect(() => {
    apiFetch(`/api/dashboard/summary?range=${range}`)
      .then(setData)
      .catch(() => {});
  }, [range]);

  useEffect(() => {
    apiFetch("/api/retrospect/analysis")
      .then(setRetro)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 640) {
        setEntryLimit(3);
      } else if (window.innerWidth < 1280) {
        setEntryLimit(5);
      } else {
        setEntryLimit(7);
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

  return (
    <main className={`p-4 md:p-6 living-bg ${moodClass}`}>
      <motion.div
        className="max-w-6xl mx-auto space-y-4"
        variants={cVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={iVariants} className="ui-card rounded-2xl p-6 md:p-7">
          <div className="grid lg:grid-cols-[1fr_auto] gap-6">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="ui-kicker">{data?.greeting || "Welcome back"}</p>
                  <h2 className="ui-title mt-1">How are you feeling today?</h2>
                </div>
                {data?.journalingStreak > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-white/55 text-sm shrink-0 lg:hidden">
                    <Flame size={14} />
                    {data.journalingStreak} day streak
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 mt-6 mb-2">
                <div>
                  <p className="text-lg font-medium capitalize flex items-center gap-1.5">
                    {data?.todaysMood && moodDotColor[data.todaysMood] && (
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: moodDotColor[data.todaysMood] }} />
                    )}
                    {data?.todaysMood ?? "--"}
                  </p>
                  <p className="text-xs text-white/60 mt-0.5">mood</p>
                </div>
                <div className="border-l border-white/10 pl-4">
                  <p className="text-lg font-medium">
                    <AnimatedNumber value={data?.entriesInRange ?? "--"} />
                  </p>
                  <p className="text-xs text-white/60 mt-0.5">entries this week</p>
                </div>
                <div className="border-l border-white/10 pl-4">
                  <p className="text-lg font-medium">
                    <AnimatedNumber value={data?.journalingStreak ?? "--"} />
                  </p>
                  <p className="text-xs text-white/60 mt-0.5">day streak</p>
                </div>
              </div>

              <p className="text-sm text-white/70 mt-4 mb-4">{data?.cumulativeInsight || "Building your insight..."}</p>

              <div className="flex gap-2 flex-wrap">
                <Link to="/journal/new" className="inline-flex px-4 py-2.5 text-sm ui-button-primary">
                  Write journal
                </Link>
                <Link to="/chat" className="inline-flex px-5 py-3 text-base ui-button-ghost">
                  Continue reflection
                </Link>
              </div>
            </div>

            {/* Wellness score moved beside the greeting on wide screens
                (its own visual column, streak folded in above it) instead of
                always being a full-width band -- makes better use of the
                extra horizontal room now that Home matches the rest of the
                app's max-w-6xl footprint. */}
            <div className="lg:w-56 lg:border-l lg:border-white/10 lg:pl-6 pt-6 lg:pt-0 border-t lg:border-t-0 border-white/10">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-white/60 uppercase tracking-wide">Wellness score</p>
                {data?.journalingStreak > 0 && (
                  <span className="hidden lg:inline-flex items-center gap-1 text-white/60 text-[11px]">
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
                  <p className="text-sm text-white/50">No health data yet</p>
                  <Link to="/health" className="text-xs text-white/60 hover:text-white/85 underline underline-offset-2">
                    Log today's numbers
                  </Link>
                </div>
              ) : (
                <>
                  <p className="ui-title text-4xl mt-1">
                    <AnimatedNumber value={data?.dailyWellnessScore ?? "--"} />
                  </p>
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
            <p className="text-sm text-white/75">{data.retrospectAlert}</p>
            <Link to="/retrospect" className="text-xs text-white/50 hover:text-white/80 shrink-0 inline-flex items-center gap-1">
              Open Retrospect <ArrowRight size={12} />
            </Link>
          </motion.div>
        )}

        {/* Quick actions -- every other real feature in this app, one tap
            away, instead of reachable only via the top/side nav. */}
        <motion.div variants={iVariants} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {quickActions.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              className="ui-card rounded-xl p-3.5 flex flex-col items-center gap-2 text-center hover:bg-white/10 transition"
            >
              <Icon size={18} className="text-white/70" />
              <span className="text-xs text-white/80">{label}</span>
            </Link>
          ))}
        </motion.div>

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

        {/* Keepsakes / Health / Retrospect -- previously stacked in a
            narrow sidebar column next to Mood Calendar (the empty-space
            problem above). Side by side as three similarly-sized cards
            instead, which is both a better height match and puts all three
            "jump into a feature" teasers at equal visual weight rather than
            implying an order of importance top-to-bottom. */}
        <div className="grid md:grid-cols-3 gap-4">
          <motion.div variants={iVariants} className="space-y-2">
            <KeepsakesLauncher variant="card" />
            <FirstTimeTip id="dashboard-keepsakes-globe">
              Keepsakes are entries you've chosen to flag as worth revisiting -- open this to see them float by.
            </FirstTimeTip>
          </motion.div>
          <motion.div variants={iVariants}>
            <HealthSnapshotCard summary={data?.quickHealthSummary} />
          </motion.div>
          <motion.div variants={iVariants}>
            <RetrospectPreviewCard retro={retro} />
          </motion.div>
        </div>

        <motion.div variants={iVariants}>
            <div className="ui-card rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium">Recent entries</h3>
                <div className="flex items-center gap-4 shrink-0">
                  <Link to="/journal/new?view=history" className="text-xs text-white/50 hover:text-white/80">
                    View all
                  </Link>
                  <Link to="/journal/new" className="text-xs text-white/50 hover:text-white/80">
                    Add new
                  </Link>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {emotionMeta.map((emotion) => (
                  <span key={emotion.key} className="inline-flex items-center gap-1.5 text-xs text-white/50">
                    <span className={`h-1.5 w-1.5 rounded-full ${emotion.color}`} />
                    {emotion.label}
                  </span>
                ))}
              </div>

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
                          ? "border-white/40 bg-white/10 text-white"
                          : "border-white/10 bg-white/5 text-white/50 hover:text-white/75"
                      }`}
                    >
                      {f.id === "keepsake" && <Gem size={10} className="text-[#e8ab5f]" />}
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Clicking an entry now opens it inline (EntryModalById --
                  fetches the real content via GET /api/journal/:id, since
                  this list only ever has a truncated excerpt) instead of
                  just linking away to the archive page. */}
              <div className="mt-2">
                {(data?.recentEntries || [])
                  .filter((e) => entryFilter === "all" || e.isKeepsake)
                  .slice(0, entryLimit)
                  .map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setOpenEntryId(entry.id)}
                      className="w-full flex items-start gap-3 py-3.5 border-t border-white/8 first:border-t-0 hover:bg-white/5 -mx-2 px-2 rounded-lg transition group text-left"
                    >
                      <span
                        className="h-2 w-2 rounded-full shrink-0 mt-1.5"
                        style={{ backgroundColor: moodDotColor[entry.mood] || "rgba(255,255,255,0.3)" }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm text-white/90 truncate group-hover:text-white">{entry.title}</p>
                          {entry.isKeepsake && <Gem size={11} className="text-[#e8ab5f] shrink-0" aria-label="Keepsake" />}
                        </div>
                        {entry.excerpt && <p className="text-xs text-white/50 mt-0.5 line-clamp-1">{entry.excerpt}</p>}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <p className="text-[11px] text-white/55 capitalize">{entry.mood}</p>
                          {(entry.tags || []).slice(0, 3).map((t) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/8 text-white/60 ui-mono">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="text-[11px] text-white/55 shrink-0 ui-mono mt-0.5">{relativeDay(entry.createdAt)}</span>
                    </button>
                  ))}
                {(data?.recentEntries || []).length === 0 && (
                  <p className="text-sm text-white/50 py-3">No entries yet -- write your first one above.</p>
                )}
                {(data?.recentEntries || []).length > 0 &&
                  (data?.recentEntries || []).filter((e) => entryFilter === "all" || e.isKeepsake).length === 0 && (
                    <p className="text-sm text-white/50 py-3">No Keepsakes among your recent entries yet.</p>
                  )}
              </div>
            </div>
        </motion.div>
      </motion.div>

      {openEntryId && (
        <EntryModalById entryId={openEntryId} onClose={() => setOpenEntryId(null)} apiFetch={apiFetch} />
      )}

      <StreakMilestone streak={data?.journalingStreak} />
    </main>
  );
}
