import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { apiFetch } from "../api";
import { isoDay } from "../utils/date";
import DayEntryPreview from "./DayEntryPreview";
import { MOOD_HEX, MOOD_LABELS, moodDotStyle } from "../utils/moodColors";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";

// Previously a GitHub-contributions-style strip of the last 18 weeks. Redone
// as an actual month calendar (weekday grid, current month by default) with
// prev/next navigation. Fetches a year of mood data once up front (the
// backend endpoint is a rolling "last N days" window, not a month/year-range
// query) and navigates within that already-fetched data rather than making a
// new request per month.
const FETCH_DAYS = 365;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const reducedMotion = usePrefersReducedMotion();
  const [moodByDate, setMoodByDate] = useState(null);
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    apiFetch(`/api/dashboard/mood-calendar?days=${FETCH_DAYS}&tzOffset=${new Date().getTimezoneOffset()}`)
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
    return <p className="text-sm text-ink/60">Loading your mood history...</p>;
  }

  return (
    <div className="grid md:grid-cols-[300px_1fr] gap-6">
      <div>
        <p className="text-xs text-signal uppercase tracking-wider">Mood Calendar</p>
        <p className="text-sm text-ink/75 mt-2 mb-3">Color-coded by mood. Click any day you journaled on.</p>

        {/* Previously the 7-column grid stretched to the full width of the
            card (which spans the whole page), so each day cell blew up to
            ~80-100px square. Capped at 300px, like an actual small calendar
            widget instead of a wall-sized one. */}
        <div className="flex items-center justify-between mb-2">
          <motion.button
            type="button"
            onClick={goPrev}
            aria-label="Previous month"
            whileTap={reducedMotion ? undefined : { scale: 0.85 }}
            className="p-1 rounded-lg hover:bg-ink/10 text-ink/70 hover:text-ink"
          >
            <ChevronLeft size={14} />
          </motion.button>
          <p className="text-xs font-medium">{monthLabel}</p>
          <motion.button
            type="button"
            onClick={goNext}
            disabled={isCurrentMonth}
            aria-label="Next month"
            whileTap={reducedMotion || isCurrentMonth ? undefined : { scale: 0.85 }}
            className="p-1 rounded-lg hover:bg-ink/10 text-ink/70 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={14} />
          </motion.button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((w) => (
            <p key={w} className="text-[9px] uppercase tracking-wide text-ink/55 text-center pb-1">
              {w[0]}
            </p>
          ))}
        </div>
        {/* Keyed on the month itself so switching months reads as moving to
            a new page (a quick slide + fade) instead of the grid's numbers
            just silently swapping in place, which was easy to miss as
            "did that actually change?" on a fast click of the arrows. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={monthLabel}
            initial={reducedMotion ? undefined : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, x: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="grid grid-cols-7 gap-1"
          >
            {cells.map((cell, i) =>
              cell ? (
                <motion.button
                  key={cell.date}
                  type="button"
                  onClick={() => cell.mood && setSelectedDate(cell.date)}
                  aria-pressed={selectedDate === cell.date}
                  title={`${cell.date}${cell.mood ? ` • ${cell.mood}` : " • no entry"}`}
                  style={cell.mood ? moodDotStyle(cell.mood, 0.75) : undefined}
                  whileHover={reducedMotion || !cell.mood ? undefined : { scale: 1.12 }}
                  whileTap={reducedMotion || !cell.mood ? undefined : { scale: 0.88 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className={`aspect-square rounded text-[11px] flex items-center justify-center transition ${
                    cell.mood
                      ? "text-ink font-medium cursor-pointer hover:brightness-110"
                      : "bg-ink/5 text-ink/55"
                  } ${cell.date === todayKey ? "ring-1 ring-ink/70" : ""} ${
                    selectedDate === cell.date ? "ring-2 ring-ink" : ""
                  }`}
                >
                  {cell.day}
                </motion.button>
              ) : (
                <div key={`blank-${i}`} />
              ),
            )}
          </motion.div>
        </AnimatePresence>

        <DayEntryPreview date={selectedDate} />
      </div>

      <div className="md:border-l md:border-ink/10 md:pl-6">
        <p className="text-xs text-signal uppercase tracking-wider">How You've Been Feeling</p>
        <p className="text-sm text-ink/75 mt-2">
          {totalThisMonth > 0
            ? `${totalThisMonth} ${totalThisMonth === 1 ? "entry" : "entries"} in ${monthLabel}.`
            : `No entries yet in ${monthLabel}.`}
        </p>

        {/* Ranked bars instead of a pill legend + separate rose chart --
            those two used to say the same thing twice (every mood's count,
            once as a pill, once as a wedge) without ever answering "which
            mood actually dominated." The dominant mood now leads as its own
            hero word (same treatment Retrospect's mood balance uses), then
            every mood ranks below it by share, most to least -- one read
            instead of visually cross-referencing two separate widgets. */}
        {totalThisMonth > 0 && dominantMood ? (
          <div className="mt-4">
            <p
              className="ui-hero-number text-3xl capitalize"
              style={{ color: MOOD_HEX[dominantMood[0]] || "rgb(var(--signal))" }}
            >
              {dominantMood[0]}
            </p>
            <p className="text-xs text-ink/50 mt-1">
              {Math.round((dominantMood[1] / totalThisMonth) * 100)}% of {monthLabel}'s entries -- the most common
              tone this month.
            </p>
            <div className="mt-4 space-y-2.5">
              {Object.entries(counts)
                .filter(([, count]) => count > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([mood, count]) => (
                  <div key={mood} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs text-ink/70 capitalize">{MOOD_LABELS[mood] || mood}</span>
                    <div className="flex-1 h-2 rounded-full bg-ink/8 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(6, (count / dominantMood[1]) * 100)}%`,
                          background: MOOD_HEX[mood] || "rgb(var(--signal))",
                        }}
                      />
                    </div>
                    <span className="w-7 shrink-0 text-right text-xs text-ink/55 ui-mono">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          totalThisMonth === 0 && <p className="text-xs text-ink/50 mt-4">Not enough entries yet this month.</p>
        )}

        {/* Journaling consistency stays on its own -- a different kind of
            fact (how often, not what mood) than the ranked bars above. */}
        {totalThisMonth > 0 && (
          <div className="mt-5 surface rounded-xl p-3.5">
            <div className="flex items-center justify-between text-xs text-ink/70">
              <span>Journaling consistency</span>
              <span className="text-ink/50">
                {totalThisMonth} / {daysElapsed} days
              </span>
            </div>
            <div className="ui-bar-track mt-2 h-1.5 rounded-full bg-ink/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-signal bg-gradient-to-b from-white/35 to-white/0"
                style={{ width: `${Math.min(100, consistencyPct)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
