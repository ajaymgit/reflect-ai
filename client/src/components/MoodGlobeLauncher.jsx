import { useMemo, useState } from "react";
import { Globe, X } from "lucide-react";
import MemoryOrbGlobe from "./MemoryOrbGlobe";
import DayEntryPreview from "./DayEntryPreview";
import { isoDay } from "../utils/date";

// Same mood -> color mapping used across the dashboard (calendar cells,
// emotion pills), kept as real hex values here since the 3D material needs
// an actual color rather than a Tailwind class.
const MOOD_HEX = {
  happy: "#e8ab5f",
  calm: "#8eb184",
  reflective: "#a989b2",
  sad: "#84689d",
  stressed: "#da8b5b",
  angry: "#ef4444",
};

// Each pearl is one journal entry -- previously it only carried a mood color
// with no link back to what was actually written, which read as decoration
// rather than a view of your journal. Now: the label is the entry's real
// title (falling back to the mood name only if it was never titled), and
// "core" memories are the ones that share your most recurring theme this
// year -- extracted keywords from your actual entries, the same ones
// Retrospect uses -- so the glowing, connected pearls mean something
// ("these are about the same thing"), not an arbitrary highlight.
function buildOrbs(moodByDate, metaByDate, topTheme) {
  const todayKey = isoDay(new Date());
  return Object.entries(moodByDate)
    .filter(([, mood]) => MOOD_HEX[mood])
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, mood]) => {
      const meta = metaByDate?.[date] || {};
      const isCore = topTheme ? (meta.themes || []).includes(topTheme) : date === todayKey;
      return {
        id: date,
        date,
        color: MOOD_HEX[mood],
        label: meta.title || mood.charAt(0).toUpperCase() + mood.slice(1),
        emotion: mood,
        themes: meta.themes || [],
        core: isCore,
        coreLabel: topTheme ? `About "${topTheme}"` : "Today",
      };
    });
}

// Small icon button that opens the memory globe -- built from the same
// mood-calendar data the calendar already fetched (moodByDate/metaByDate
// passed down from MoodCalendar), so opening it needs no extra request.
export default function MoodGlobeLauncher({ moodByDate, metaByDate, topTheme }) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const orbs = useMemo(
    () => buildOrbs(moodByDate || {}, metaByDate || {}, topTheme || null),
    [moodByDate, metaByDate, topTheme],
  );
  const coreCount = orbs.filter((o) => o.core).length;

  function handleOpen() {
    setSelectedDate(null);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={orbs.length === 0}
        title={orbs.length ? "View your journal as a memory planet" : "Journal a few days to unlock the memory globe"}
        aria-label="Open memory globe"
        className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition"
      >
        <Globe size={14} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 gap-4">
              <p className="text-sm text-white/80">
                Each pearl is a day you journaled, colored by mood. Drag to explore, click one to reopen that entry.
                {topTheme && coreCount > 1 ? (
                  <>
                    {" "}
                    The <span className="text-white font-medium">{coreCount}</span> glowing, connected pearls all
                    mention <span className="text-white font-medium">"{topTheme}"</span> -- your most recurring
                    theme.
                  </>
                ) : (
                  " Today's entry glows brightest."
                )}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close memory globe"
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition shrink-0"
              >
                <X size={18} />
              </button>
            </div>
            <MemoryOrbGlobe orbs={orbs} onOrbClick={(orb) => setSelectedDate(orb.date)} />
            {selectedDate && (
              <div className="ui-card rounded-2xl p-4 mt-3">
                <DayEntryPreview date={selectedDate} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
