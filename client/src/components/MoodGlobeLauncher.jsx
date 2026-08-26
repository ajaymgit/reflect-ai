import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Gem, X } from "lucide-react";
import { motion } from "framer-motion";
import MemoryOrbGlobe from "./MemoryOrbGlobe";
import DayEntryPreview from "./DayEntryPreview";
import { apiFetch } from "../api";
import { MOOD_HEX } from "../utils/moodColors";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";

// Renamed from "Core Memories" to "Keepsakes" (filename unchanged to avoid a
// risky rename-on-disk of a file with 3D/graphics dependencies; the export
// below is what the rest of the app imports). More importantly, this is no
// longer an algorithmic pick -- previously EVERY journaled day showed up as
// an orb, with a heuristic ("today's entry", or whatever tied to your single
// most recurring theme) deciding which ones glowed as "core." That meant the
// app was choosing what counted as meaningful, and everything else got
// dragged into the globe as filler. Now this only ever shows entries someone
// explicitly marked as a Keepsake at write-time (JournalEntry.isKeepsake,
// set from the toggle on JournalPage's composer) -- a real, opt-in
// collection, not "everything, with a few highlighted." Also self-contained:
// it fetches its own data rather than depending on MoodCalendar to fetch and
// hand it down, so it can be rendered anywhere as its own standalone button.
function buildKeepsakeOrbs(days) {
  return (days || [])
    .filter((d) => d.isKeepsake && MOOD_HEX[d.mood])
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => ({
      id: d.date,
      date: d.date,
      color: MOOD_HEX[d.mood],
      label: d.title || d.mood.charAt(0).toUpperCase() + d.mood.slice(1),
      emotion: d.mood,
      themes: d.themes || [],
      // Every orb here already passed the isKeepsake filter, so every orb
      // gets the same glow/trail treatment -- there's no second tier of
      // "more core than the others" the way the old theme-heuristic implied.
      core: true,
      coreLabel: "Keepsake",
    }));
}

export default function MoodGlobeLauncher({ variant = "card" }) {
  const reducedMotion = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [days, setDays] = useState(null);

  useEffect(() => {
    apiFetch(`/api/dashboard/mood-calendar?days=365&tzOffset=${new Date().getTimezoneOffset()}`)
      .then((data) => setDays(data?.days || []))
      .catch(() => setDays([]));
  }, []);

  const orbs = useMemo(() => buildKeepsakeOrbs(days || []), [days]);

  function handleOpen() {
    setSelectedDate(null);
    setOpen(true);
  }

  return (
    <>
      {variant === "feature" ? (
        // A full-width band with its own ember accent border (every other
        // Dashboard teaser -- Health, Retrospect -- uses the signal-blue
        // left border; this one deliberately doesn't, so it reads as a
        // different kind of thing: an experience to open, not a data
        // preview) instead of a same-size box in a 3-up grid where it used
        // to visually blend in with Health/Retrospect and, disabled and
        // grayed out for anyone without a Keepsake yet, was easy to miss
        // entirely.
        <button
          type="button"
          onClick={handleOpen}
          disabled={orbs.length === 0}
          className="w-full text-left ui-card rounded-2xl border-l-[5px] border-l-[#e8ab5f] p-5 flex items-center gap-5 hover:bg-ink/[0.03] transition disabled:hover:bg-transparent group"
        >
          <span className="shrink-0 h-14 w-14 rounded-full bg-gradient-to-br from-[#e8ab5f]/60 to-signal/50 border border-ink/15 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Gem size={24} className="text-ink" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="ui-kicker text-[#e8ab5f]">Keepsakes</span>
            <span className="block text-base font-medium mt-1">
              {orbs.length
                ? `Revisit ${orbs.length} saved ${orbs.length === 1 ? "moment" : "moments"} as a small glowing world`
                : "Nothing saved yet"}
            </span>
            <span className="block text-sm text-ink/60 mt-0.5">
              {orbs.length
                ? "Drag to explore, click any orb to reopen that entry."
                : "Mark an entry as a Keepsake from the composer to start your collection."}
            </span>
          </span>
          {orbs.length > 0 && (
            <ArrowRight size={18} className="text-ink/40 shrink-0 group-hover:text-ink/70 transition" />
          )}
        </button>
      ) : variant === "card" ? (
        <button
          type="button"
          onClick={handleOpen}
          disabled={orbs.length === 0}
          className="w-full text-left ui-card rounded-2xl p-4 flex items-center gap-4 hover:bg-ink/10 transition disabled:opacity-60 disabled:hover:bg-ink/5 group"
        >
          <span className="shrink-0 h-12 w-12 rounded-full bg-gradient-to-br from-[#e8ab5f]/50 to-signal/50 border border-ink/15 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Gem size={20} className="text-ink/90" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Keepsakes</span>
            <span className="block text-xs text-ink/60 mt-0.5">
              {orbs.length
                ? `Revisit ${orbs.length} saved ${orbs.length === 1 ? "moment" : "moments"} as a small glowing world.`
                : "Not every entry has to be one -- mark an entry as a Keepsake to start your collection."}
            </span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          disabled={orbs.length === 0}
          title={orbs.length ? "Revisit your Keepsakes" : "Mark an entry as a Keepsake to start your collection"}
          aria-label="Open Keepsakes"
          className="p-1.5 rounded-lg hover:bg-ink/10 text-ink/70 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent transition"
        >
          <Gem size={14} />
        </button>
      )}

      {/* Rendered via a portal straight onto <body>, not as a normal child
          here -- an ancestor with backdrop-filter (like .ui-card's blur)
          creates a new containing block for `position: fixed` descendants
          per the CSS spec, so without the portal this modal would render
          squashed into wherever this button sits on the page instead of
          covering the viewport. */}
      {open &&
        createPortal(
          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3 gap-4">
                <p className="text-sm text-ink/80">
                  Each glowing orb is a Keepsake you chose to save. Drag to explore, click one to reopen that entry.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close Keepsakes"
                  className="p-1.5 rounded-lg hover:bg-ink/10 text-ink/70 hover:text-ink transition shrink-0"
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
            </motion.div>
          </motion.div>,
          document.body,
        )}
    </>
  );
}
