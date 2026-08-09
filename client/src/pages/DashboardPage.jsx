import { useEffect, useState } from "react";
import { CalendarRange, Flame, HeartPulse, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import AnimatedNumber from "../components/AnimatedNumber";
import MoodCalendar from "../components/MoodCalendar";

const ranges = ["today", "week", "month"];
const moodColors = {
  happy: "bg-[#e8ab5f]/80",
  calm: "bg-[#8eb184]/80",
  reflective: "bg-[#a989b2]/80",
  sad: "bg-[#84689d]/80",
  stressed: "bg-[#da8b5b]/80",
  angry: "bg-[#ef4444]/80",
};
const emotionMeta = [
  { key: "happy", label: "Happy", color: "bg-[#e8ab5f]" },
  { key: "calm", label: "Calm", color: "bg-[#8eb184]" },
  { key: "reflective", label: "Reflective", color: "bg-[#a989b2]" },
  { key: "sad", label: "Sad", color: "bg-[#84689d]" },
  { key: "stressed", label: "Stressed", color: "bg-[#da8b5b]" },
  { key: "angry", label: "Angry", color: "bg-[#ef4444]" },
];

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [range, setRange] = useState("week");
  const [entryLimit, setEntryLimit] = useState(8);

  useEffect(() => {
    apiFetch(`/api/dashboard/summary?range=${range}`)
      .then(setData)
      .catch(() => {});
  }, [range]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 640) {
        setEntryLimit(3);
      } else if (window.innerWidth < 1024) {
        setEntryLimit(6);
      } else {
        setEntryLimit(8);
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
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="ui-card rounded-3xl p-6 md:p-7">
          <p className="ui-kicker">{data?.greeting || "Welcome back"}</p>
          <h2 className="ui-title mt-2">How are you feeling today?</h2>
          <p className="text-sm text-white/70 mt-3 max-w-2xl">
            Start with a quick entry. Keep it short or write deeply, your history and mood patterns will build over time.
          </p>
          <div className="mt-5 flex gap-2 flex-wrap">
            <Link
              to="/journal/new"
              className="inline-flex px-4 py-2.5 text-sm ui-button-primary"
            >
              Write journal
            </Link>
            <Link to="/chat" className="inline-flex px-5 py-3 text-base ui-button-ghost">
              Continue reflection
            </Link>
          </div>
        </div>

        {/* Previously the Today/This week/This month toggle was its own
            full-width card holding nothing else -- mostly empty space next to
            three small buttons. Now it's the header of the one block it
            actually controls (all four stats below react to it), instead of
            floating disconnected above four separate cards. */}
        <div className="ui-card rounded-2xl p-5">
          <div className="inline-flex gap-1 rounded-lg bg-black/15 p-1">
            {ranges.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                aria-pressed={item === range}
                className={`px-3 py-1.5 rounded-md text-xs capitalize transition ${
                  item === range ? "bg-[#8fae73]/30 text-white" : "text-white/60 hover:text-white/85"
                }`}
              >
                {item === "week" ? "This week" : item === "month" ? "This month" : "Today"}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard label="Daily wellness" value={data?.dailyWellnessScore ?? "--"} icon={HeartPulse} />
            <StatCard
              label="Journaling streak"
              value={data?.journalingStreak ?? "--"}
              icon={Flame}
              streakDays={data?.journalingStreak ?? 0}
              // Streak counts *consecutive* days ending today -- sitting at 0
              // right next to "Entries this week: 6" reads as a contradiction
              // (or a bug) at a glance unless it's clear today just hasn't
              // been journaled yet.
              hint={data?.journalingStreak === 0 && data?.entriesInRange > 0 ? "No entry today yet" : null}
            />
            <StatCard
              label={range === "today" ? "Entries today" : range === "week" ? "Entries this week" : "Entries this month"}
              value={data?.entriesInRange ?? "--"}
              icon={CalendarRange}
            />
            <StatCard label="Current emotional state" value={data?.todaysMood ?? "--"} icon={Sparkles} />
          </div>
        </div>

        {/* The calendar is a fixed ~300px widget, so it used to leave a wide
            empty strip next to it inside a full-width card. "How You've Been
            Feeling" now lives inside MoodCalendar itself, scoped to whichever
            month the calendar is currently showing (previously this block
            read data?.emotionDistribution, a fixed last-60-entries window
            with no relation to month navigation). */}
        <div className="ui-card rounded-2xl p-5">
          <MoodCalendar />
        </div>

        <div className="ui-card rounded-2xl p-4">
          <p className="text-xs text-[#c5d7a6] uppercase tracking-wider">Cumulative Insight</p>
          <p className="text-sm text-white/85 mt-2">{data?.cumulativeInsight || "Building your insight..."}</p>
        </div>

        <div className="grid gap-4">
          <div className="ui-card rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Your recent moments</h3>
              <Link to="/journal/new" className="text-xs text-[#d9d2b0] hover:text-[#e6dfbf]">
                Add new
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {emotionMeta.map((emotion) => (
                <span
                  key={emotion.key}
                  className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-xs text-white/80"
                >
                  <span className={`h-2 w-2 rounded-full ${emotion.color}`} />
                  {emotion.label}
                </span>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {(data?.recentEntries || []).slice(0, entryLimit).map((entry) => (
                <div key={entry.id} className="surface p-3 relative overflow-hidden">
                  <span className={`absolute left-0 top-0 bottom-0 w-1 ${moodColors[entry.mood] || "bg-cyan-400/70"}`} />
                  <p className="text-xs text-white/60 pl-2">{new Date(entry.createdAt).toDateString()}</p>
                  <p className="text-sm text-white/85 mt-1 pl-2">{entry.title}</p>
                  <p className="text-[11px] text-[#d9d2b0] mt-2 capitalize pl-2">{entry.mood}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function streakGlowClass(streakDays) {
  // Previously a single fixed glow regardless of whether the streak was 1
  // day or 60 -- now it actually grows warmer/stronger with a real streak,
  // instead of being a flat decoration.
  if (streakDays >= 14) return "streak-glow-3";
  if (streakDays >= 3) return "streak-glow-2";
  if (streakDays >= 1) return "streak-glow-1";
  return "";
}

function StatCard({ label, value, icon: Icon, streakDays, hint }) {
  const glowClass = streakDays !== undefined ? streakGlowClass(streakDays) : "";
  // Was `ui-card` (same heavy bordered/blurred treatment as the block
  // wrapping it) -- reads as four cards nested inside a card. `surface` is
  // the lighter cell style already used elsewhere for items inside a card
  // (e.g. Journal's sidebar), so these read as one block's cells instead.
  return (
    <div className={`surface rounded-2xl p-5 ${glowClass}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-white/70">{label}</p>
        {Icon ? <Icon size={18} className="text-[#d9d2b0]" /> : null}
      </div>
      <p className="text-3xl font-semibold mt-2 capitalize">
        <AnimatedNumber value={value} />
      </p>
      {hint && <p className="text-[11px] text-white/50 mt-1">{hint}</p>}
    </div>
  );
}
