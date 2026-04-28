import { useEffect, useState } from "react";
import { CalendarRange, Flame, HeartPulse, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";

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
    <main className={`relative min-h-[calc(100vh-76px)] overflow-hidden p-4 md:p-6 living-bg ${moodClass}`}>
      <div className="relative z-10 max-w-6xl mx-auto space-y-5">
        <div className="glass glow-card rounded-[2rem] p-6 md:p-8 overflow-hidden">
          <div className="grid gap-6 lg:grid-cols-[1fr_280px] lg:items-end">
            <div>
              <span className="eyebrow-chip">{data?.greeting || "Welcome back"}</span>
              <h2 className="mt-4 text-4xl md:text-6xl font-semibold tracking-tight text-balance">
                How are you feeling today?
              </h2>
              <p className="text-base text-white/72 mt-4 max-w-2xl leading-7">
                Start with a quick entry, then let your mood history and health rhythms shape a more thoughtful reflection.
              </p>
              <div className="mt-6 flex gap-3 flex-wrap">
                <Link to="/journal/new" className="btn-primary">
                  Write journal
                </Link>
                <Link to="/chat" className="btn-secondary">
                  Continue reflection
                </Link>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <p className="text-xs uppercase tracking-[0.28em] text-[#d9d2b0]">Today</p>
              <p className="mt-3 text-6xl font-semibold">{data?.dailyWellnessScore ?? "--"}</p>
              <p className="mt-2 text-sm text-white/65">Daily wellness score</p>
              <div className="mt-5 h-2 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#8fae73] to-[#e8ab5f]"
                  style={{ width: `${Math.min(Number(data?.dailyWellnessScore || 0), 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-3 flex flex-wrap gap-2">
          {ranges.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRange(item)}
              className={`px-4 py-2.5 rounded-xl text-sm capitalize border transition ${
                item === range ? "bg-[#8fae73]/30 border-[#d9d2b0]/50 shadow-[0_0_18px_rgba(143,174,115,0.18)]" : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              {item === "week" ? "This week" : item === "month" ? "This month" : "Today"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <StatCard label="Daily wellness" value={data?.dailyWellnessScore ?? "--"} icon={HeartPulse} />
          <StatCard label="Journaling streak" value={data?.journalingStreak ?? "--"} icon={Flame} highlight />
          <StatCard
            label={range === "today" ? "Entries today" : range === "week" ? "Entries this week" : "Entries this month"}
            value={data?.entriesInRange ?? "--"}
            icon={CalendarRange}
          />
          <StatCard label="Current emotional state" value={data?.todaysMood ?? "--"} icon={Sparkles} />
        </div>

        <div className="glass rounded-3xl p-5">
          <p className="text-xs text-[#d9d2b0] uppercase tracking-wider">How You've Been Feeling</p>
          <p className="text-sm text-white/75 mt-2">
            A simple mood snapshot from your recent journals.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {emotionMeta.map((emotion) => {
              const count = data?.emotionDistribution?.[emotion.key] ?? 0;
              return (
                <div
                  key={emotion.key}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 shadow-inner"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${emotion.color}`} />
                  <span className="text-sm text-white/90">{emotion.label}</span>
                  <span className="text-xs text-white/60">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass rounded-3xl p-5">
          <p className="text-xs text-[#c5d7a6] uppercase tracking-wider">Cumulative Insight</p>
          <p className="text-sm text-white/85 mt-2">{data?.cumulativeInsight || "Building your insight..."}</p>
        </div>

        <div className="grid gap-4">
          <div className="glass rounded-3xl p-5">
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
                <div key={entry.id} className="rounded-2xl bg-white/[0.07] border border-white/10 p-4 relative overflow-hidden transition hover:-translate-y-0.5 hover:bg-white/10">
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

function StatCard({ label, value, icon: Icon, highlight = false }) {
  return (
    <div className={`glass rounded-3xl p-5 transition hover:-translate-y-0.5 ${highlight ? "shadow-[0_0_24px_rgba(143,174,115,0.28)]" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-white/70">{label}</p>
        {Icon ? <Icon size={18} className="text-[#d9d2b0]" /> : null}
      </div>
      <p className="text-3xl font-semibold mt-2 capitalize">{value}</p>
    </div>
  );
}
