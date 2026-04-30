import { useEffect, useState } from "react";
import { CalendarRange, Flame, HeartPulse, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { ButtonLink, Card, MetricSkeleton, PageHeader, PageState } from "../ui";

const ranges = ["today", "week", "month"];
const moodColors = {
  happy: "bg-mood-happy",
  calm: "bg-mood-calm",
  reflective: "bg-mood-reflective",
  sad: "bg-mood-sad",
  stressed: "bg-mood-stressed",
  angry: "bg-mood-angry",
};
const emotionMeta = [
  { key: "happy", label: "Happy", color: "bg-mood-happy" },
  { key: "calm", label: "Calm", color: "bg-mood-calm" },
  { key: "reflective", label: "Reflective", color: "bg-mood-reflective" },
  { key: "sad", label: "Sad", color: "bg-mood-sad" },
  { key: "stressed", label: "Stressed", color: "bg-mood-stressed" },
  { key: "angry", label: "Angry", color: "bg-mood-angry" },
];

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [range, setRange] = useState("week");
  const [entryLimit, setEntryLimit] = useState(8);
  const [quickMood, setQuickMood] = useState("");
  const [quickMoodStatus, setQuickMoodStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    apiFetch(`/api/dashboard/summary?range=${range}`)
      .then(setData)
      .catch((err) => setError(err.message || "Could not load dashboard."))
      .finally(() => setLoading(false));
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
  const moodCheckOptions = [
    { id: "sad", label: "😔", text: "Low" },
    { id: "stressed", label: "😟", text: "Stressed" },
    { id: "reflective", label: "🙂", text: "Reflective" },
    { id: "calm", label: "😌", text: "Calm" },
    { id: "happy", label: "😊", text: "Good" },
  ];
  const sections = [
    { id: "home-overview", label: "Overview" },
    { id: "home-mood", label: "Mood" },
    { id: "home-insight", label: "Insight" },
    { id: "home-journal", label: "Journal" },
  ];
  const dailyQuotes = [
    "Small steps still count as progress.",
    "Your feelings are valid, even when they are mixed.",
    "Breathe slowly. You are doing better than you think.",
    "You can pause without giving up.",
  ];
  const dailyQuote = dailyQuotes[new Date().getDate() % dailyQuotes.length];
  function jumpTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveQuickMood(mood) {
    setQuickMood(mood);
    setQuickMoodStatus("Saving...");
    try {
      await apiFetch("/api/journal/quick-entry", {
        method: "POST",
        body: JSON.stringify({
          content: `Quick mood check-in: ${mood}`,
          mood,
        }),
      });
      setQuickMoodStatus("Saved");
    } catch {
      setQuickMoodStatus("Could not save");
    }
  }

  return (
    <main className={`p-4 md:p-6 living-bg ${moodClass}`}>
      <div className="max-w-6xl mx-auto space-y-4">
        <details className="glass rounded-2xl p-3">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-white/65">Jump to section</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => jumpTo(section.id)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
              >
                {section.label}
              </button>
            ))}
            <Link
              to="/retrospect"
              className="rounded-full border border-white/10 bg-brand-300/20 px-3 py-1.5 text-xs hover:bg-brand-300/30"
            >
              Open Look Back
            </Link>
          </div>
        </details>
        <PageHeader
          eyebrow={data?.greeting || "Welcome back"}
          title="How are you feeling today?"
          description="Write a quick note or continue your reflection."
          action={
            <>
              <ButtonLink to="/journal/new">Write journal</ButtonLink>
              <ButtonLink to="/chat" variant="secondary">Continue reflection</ButtonLink>
            </>
          }
        />

        <Card>
          <p className="text-xs text-brand-100 uppercase tracking-wider">Quick Mood Check-In</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {moodCheckOptions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => saveQuickMood(item.id)}
                className={`rounded-full border px-3 py-2 min-h-[44px] text-sm ${
                  quickMood === item.id
                    ? "bg-brand-300/30 border-brand-100/50"
                    : "bg-white/5 border-white/10 hover:bg-white/10"
                }`}
              >
                <span className="mr-1" aria-hidden="true">{item.label}</span>
                {item.text}
              </button>
            ))}
          </div>
          {quickMoodStatus ? <p className="mt-2 text-xs text-white/65">{quickMoodStatus}</p> : null}
        </Card>

        <details className="glass rounded-2xl p-4">
          <summary className="cursor-pointer text-sm font-semibold text-white">
            View options ({range === "week" ? "This week" : range === "month" ? "This month" : "Today"})
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {ranges.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={item === range}
                onClick={() => setRange(item)}
                className={`px-4 py-2.5 min-h-[44px] rounded-lg text-sm capitalize border ${
                  item === range ? "bg-brand-300/25 border-brand-100/50" : "bg-white/5 border-white/10"
                }`}
              >
                {item === "week" ? "This week" : item === "month" ? "This month" : "Today"}
              </button>
            ))}
          </div>
        </details>

        {error ? <PageState title="Dashboard could not load" message={error} /> : null}

        <div id="home-overview" className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 gap-3">
          {loading
            ? [0, 1].map((item) => <MetricSkeleton key={item} />)
            : (
              <>
                <StatCard label="Today's wellness score" value={data?.dailyWellnessScore ?? "--"} icon={HeartPulse} />
                <StatCard label="Journaling streak" value={data?.journalingStreak ?? "--"} icon={Flame} highlight />
              </>
            )}
        </div>
        <details className="glass rounded-2xl p-4">
          <summary className="cursor-pointer text-sm font-semibold text-white">More overview stats</summary>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 gap-3">
            {loading ? (
              [0, 1].map((item) => <MetricSkeleton key={`extra-${item}`} />)
            ) : (
              <>
                <StatCard
                  label={range === "today" ? "Entries today" : range === "week" ? "Entries this week" : "Entries this month"}
                  value={data?.entriesInRange ?? "--"}
                  icon={CalendarRange}
                />
                <StatCard label="How you feel now" value={data?.todaysMood ?? "--"} icon={Sparkles} />
              </>
            )}
          </div>
        </details>

        <details id="home-mood" className="glass rounded-2xl p-4">
          <summary className="cursor-pointer text-sm font-semibold text-white">How you've been feeling</summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {emotionMeta.map((emotion) => {
              const count = data?.emotionDistribution?.[emotion.key] ?? 0;
              return (
                <div
                  key={emotion.key}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${emotion.color}`} />
                  <span className="text-sm text-white/90">{emotion.label}</span>
                  <span className="text-xs text-white/60">{count}</span>
                </div>
              );
            })}
          </div>
        </details>

        <details id="home-insight" className="glass rounded-2xl p-4">
          <summary className="cursor-pointer text-sm font-semibold text-white">Simple takeaway</summary>
          <p className="text-sm text-white/85 mt-3">{data?.cumulativeInsight || "Building your insight..."}</p>
        </details>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <p className="text-xs text-brand-200 uppercase tracking-wider">Daily Quote</p>
            <p className="text-sm text-white/85 mt-2">{dailyQuote}</p>
          </Card>
          <Card>
            <p className="text-xs text-brand-200 uppercase tracking-wider">One Action</p>
            <p className="text-sm text-white/85 mt-2">Take one slow 20-second breathing break now.</p>
            <ButtonLink to="/health" className="mt-3 w-full sm:w-auto">
              Start breathing reset
            </ButtonLink>
          </Card>
        </div>

        {(data?.recentEntries || []).length === 0 && !loading ? (
          <Card>
            <p className="text-xs text-brand-100 uppercase tracking-wider">Start Here</p>
            <div className="mt-2 space-y-2 text-sm text-white/80">
              <p>1) Write your first journal note.</p>
              <p>2) Open chat and continue reflection.</p>
              <p>3) Use Look Back to spot patterns.</p>
            </div>
          </Card>
        ) : null}

        <div id="home-journal" className="grid gap-4">
          <details className="glass rounded-2xl p-4" open>
            <summary className="cursor-pointer text-sm font-semibold text-white">Your recent moments</summary>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-white/65">Recent journal entries</p>
              <Link to="/journal/new" className="text-xs text-brand-100 hover:text-brand-50">
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
            {(data?.recentEntries || []).length === 0 && !loading ? (
              <PageState
                title="No journal moments yet"
                message="Write a quick entry to start building your mood history."
                action={
                  <Link to="/journal/new" className="text-brand-100 hover:text-brand-50">
                    Write your first entry
                  </Link>
                }
              />
            ) : (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {(data?.recentEntries || []).slice(0, entryLimit).map((entry) => (
                  <div key={entry.id} className="rounded-xl bg-white/5 border border-white/10 p-3 relative overflow-hidden">
                    <span className={`absolute left-0 top-0 bottom-0 w-1 ${moodColors[entry.mood] || "bg-brand-300"}`} />
                    <p className="text-xs text-white/60 pl-2">{new Date(entry.createdAt).toDateString()}</p>
                    <p className="text-sm text-white/85 mt-1 pl-2">{entry.title}</p>
                    <p className="text-[11px] text-brand-100 mt-2 capitalize pl-2">{entry.mood}</p>
                  </div>
                ))}
              </div>
            )}
          </details>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, icon: Icon, highlight = false }) {
  return (
    <Card className={highlight ? "shadow-[0_0_24px_rgba(143,174,115,0.28)]" : ""}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-white/70">{label}</p>
        {Icon ? <Icon size={18} className="text-brand-100" /> : null}
      </div>
      <p className="text-3xl font-semibold mt-2 capitalize">{value}</p>
    </Card>
  );
}
