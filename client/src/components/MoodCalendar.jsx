import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "../api";
import { isoDay } from "../utils/date";
import DayEntryPreview from "./DayEntryPreview";
import MoodRoseChart from "./MoodRoseChart";
import { MOOD_META as emotionMeta, MOOD_BG_CLASS } from "../utils/moodColors";

// Previously a GitHub-contributions-style strip of the last 18 weeks. Redone
// as an actual month calendar (weekday grid, current month by default) with
// prev/next navigation. Fetches a year of mood data once up front (the
// backend endpoint is a rolling "last N days" window, not a month/year-range
// query) and navigates within that already-fetched data rather than making a
// new request per month.
const FETCH_DAYS = 365;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const moodColors = Object.fromEntries(
  Object.keys(MOOD_BG_CLASS).map((mood) => [mood, `${MOOD_BG_CLASS[mood]}/75`])
);

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function buildMonthGrid(viewDate, moodByDate) {
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const leadingBlanks = startOfMonth(viewDate).getDay();
  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = isoDay(new Date(viewDate.getFullYear(), viewDate.getMonth(), day));
    cells.push({ date, day, mood: moodByDate[date] || null });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// "How You've Been Feeling" used to always summarize your last 60 entries
// overall -- now it's scoped to whichever month the calendar next to it is
// showing, computed from the same already-fetched mood map instead of a
// separate request.
function monthCounts(viewDate, moodByDate) {
  const prefix = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}`;
  const counts = { happy: 0, calm: 0, reflective: 0, sad: 0, stressed: 0, angry: 0 };
  for (const [date, mood] of Object.entries(moodByDate)) {
    if (date.startsWith(prefix) && counts[mood] !== undefined) counts[mood] += 1;
  }
  return counts;
}

export default function MoodCalendar() {
  const [moodByDate, setMoodByDate] = useState(null);
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    apiFetch(`/api/dashboard/mood-calendar?days=${FETCH_DAYS}`)
      .then((data) => {
        const byDate = {};
        for (const item of data?.days || []) {
          byDate[item.date] = item.mood;
        }
        setMoodByDate(byDate);
      })
      .catch(() => setMoodByDate({}));
  }, []);

  const cells = useMemo(() => (moodByDate ? buildMonthGrid(viewDate, moodByDate) : []), [viewDate, moodByDate]);
  const counts = useMemo(() => (moodByDate ? monthCounts(viewDate, moodByDate) : null), [viewDate, moodByDate]);
  const totalThisMonth = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  const today = new Date();
  const isCurrentMonth = viewDate.getFullYear() === today.getFullYear() && viewDate.getMonth() === today.getMonth();
  const todayKey = isoDay(today);
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // Days elapsed so far this month (all of it, if viewing a past month) --
  // used as the denominator for a consistency bar, and the mood with the
  // highest count this month, used for a one-line callout. Both come from
  // moodByDate/counts already in memory, no extra request.
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const daysElapsed = isCurrentMonth ? today.getDate() : daysInMonth;
  const consistencyPct = daysElapsed > 0 ? Math.round((totalThisMonth / daysElapsed) * 100) : 0;
  const dominantMood = counts
    ? Object.entries(counts).reduce((best, [key, count]) => (count > (best?.[1] ?? 0) ? [key, count] : best), null)
    : null;

  function goPrev() {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    setSelectedDate(null);
  }
  function goNext() {
    if (isCurrentMonth) return;
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    setSelectedDate(null);
  }

  if (moodByDate === null) {
    return <p className="text-sm text-white/60">Loading your mood history...</p>;
  }

  return (
    <div className="grid md:grid-cols-[300px_1fr] gap-6">
      <div>
        <p className="text-xs text-[#d9d2b0] uppercase tracking-wider">Mood Calendar</p>
        <p className="text-sm text-white/75 mt-2 mb-3">Color-coded by mood. Click any day you journaled on.</p>

        {/* Previously the 7-column grid stretched to the full width of the
            card (which spans the whole page), so each day cell blew up to
            ~80-100px square. Capped at 300px, like an actual small calendar
            widget instead of a wall-sized one. */}
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous month"
            className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
          >
            <ChevronLeft size={14} />
          </button>
          <p className="text-xs font-medium">{monthLabel}</p>
          <button
            type="button"
            onClick={goNext}
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((w) => (
            <p key={w} className="text-[9px] uppercase tracking-wide text-white/55 text-center pb-1">
              {w[0]}
            </p>
          ))}
          {cells.map((cell, i) =>
            cell ? (
              <button
                key={cell.date}
                type="button"
                onClick={() => cell.mood && setSelectedDate(cell.date)}
                aria-pressed={selectedDate === cell.date}
                title={`${cell.date}${cell.mood ? ` • ${cell.mood}` : " • no entry"}`}
                className={`aspect-square rounded text-[11px] flex items-center justify-center transition ${
                  cell.mood
                    ? `${moodColors[cell.mood] || "bg-white/30"} text-white font-medium cursor-pointer hover:brightness-110`
                    : "bg-white/5 text-white/55"
                } ${cell.date === todayKey ? "ring-1 ring-white/70" : ""} ${
                  selectedDate === cell.date ? "ring-2 ring-white" : ""
                }`}
              >
                {cell.day}
              </button>
            ) : (
              <div key={`blank-${i}`} />
            ),
          )}
        </div>

        <DayEntryPreview date={selectedDate} />
      </div>

      <div className="md:border-l md:border-white/10 md:pl-6">
        <p className="text-xs text-[#d9d2b0] uppercase tracking-wider">How You've Been Feeling</p>
        <p className="text-sm text-white/75 mt-2">
          {totalThisMonth > 0
            ? `${totalThisMonth} ${totalThisMonth === 1 ? "entry" : "entries"} in ${monthLabel}.`
            : `No entries yet in ${monthLabel}.`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {emotionMeta.map((emotion) => (
            <div
              key={emotion.key}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5"
            >
              <span className={`h-2.5 w-2.5 rounded-full ${emotion.color}`} />
              <span className="text-sm text-white/90">{emotion.label}</span>
              <span className="text-xs text-white/60">{counts?.[emotion.key] ?? 0}</span>
            </div>
          ))}
        </div>

        {/* Same month-scoped `counts` the pills above already use -- kept in
            sync with calendar navigation for free, unlike the old
            last-60-entries-regardless-of-month distribution this replaced. */}
        {totalThisMonth > 0 && (
          <div className="mt-4">
            <MoodRoseChart distribution={counts} />
          </div>
        )}

        {/* Fills the space below the pills: how consistently you journaled
            this month, plus which mood showed up most. Both derived from
            data already in memory (moodByDate/counts), no extra request. */}
        {totalThisMonth > 0 && (
          <div className="mt-5 space-y-4">
            <div className="surface rounded-xl p-3.5">
              <div className="flex items-center justify-between text-xs text-white/70">
                <span>Journaling consistency</span>
                <span className="text-white/50">
                  {totalThisMonth} / {daysElapsed} days
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#8fae73]"
                  style={{ width: `${Math.min(100, consistencyPct)}%` }}
                />
              </div>
            </div>

            {dominantMood && dominantMood[1] > 0 && (
              <div className="surface rounded-xl p-3.5 flex items-center gap-3">
                <span className={`h-8 w-8 rounded-full ${moodColors[dominantMood[0]] || "bg-white/30"} shrink-0`} />
                <p className="text-sm text-white/85">
                  You've mostly felt{" "}
                  <span className="font-medium capitalize text-white">{dominantMood[0]}</span> this month.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
