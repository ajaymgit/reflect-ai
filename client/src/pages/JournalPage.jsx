import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, Clock, Lightbulb, Mail, Sparkles } from "lucide-react";
import { apiFetch, describeError } from "../api";
import EntryModal, { EntryModalById } from "../components/EntryModal";
import FirstTimeTip from "../components/FirstTimeTip";
import JournalHistoryView from "./JournalHistoryPage";
import { suggestMoodFromText } from "../utils/moodSuggestion";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";

// Same stagger/entrance pattern Dashboard, Retrospect, Health, and Year in
// Review all use -- Journal (the single most-visited page in the app, and
// the only one of the five main nav destinations still missing it) previously
// rendered with a hard instant cut, the one page that felt static next to
// every other page's fade-and-rise entrance.
const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};
const staticContainerVariants = { hidden: {}, visible: {} };
const staticItemVariants = { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } };

// Local-storage draft key. Previously there was zero autosave -- a refresh,
// an accidental back-navigation, or the tab just crashing lost whatever was
// typed, with no warning and no way back. This is a real, proven gap (every
// serious writing app researched for this pass -- Day One, Calmly Writer,
// Journey -- treats autosave as table stakes, not a nice-to-have), not
// decoration.
const DRAFT_KEY = "equoria-journal-draft";

// Rotates by day-of-year (deterministic, not random-per-render) so the same
// prompt sticks around for a whole day instead of changing every time this
// page re-renders, but still varies day to day instead of the one static
// line this used to always show.
const writingPrompts = [
  "What changed in your energy between morning and evening today?",
  "What's one thing you're avoiding writing about right now?",
  "Who affected your mood the most today, and how?",
  "What would you tell a friend who had the day you just had?",
  "What's a small win from today that's easy to overlook?",
  "What's still unresolved in your mind from earlier today?",
  "If today had a headline, what would it say?",
];
function todaysPrompt() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return writingPrompts[dayOfYear % writingPrompts.length];
}

// Same mid-word-cutoff problem as the server's recentEntries titles (see
// dashboard/routes.js) -- a plain slice() with no ellipsis on the related
// entry preview below.
function truncateAtWord(text, maxLen) {
  if (!text || text.length <= maxLen) return text || "";
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const clean = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${clean}…`;
}

import { MOODS as moods, MOOD_HEX, moodDotStyle } from "../utils/moodColors";

// Same per-mood colors used on Dashboard/Chat (shared utils/moodColors.js),
// so the selected mood button actually reflects that mood's color everywhere
// in the app instead of a single generic "selected" color regardless of
// which mood was picked. Previously only the *selected* button got any
// color at all (a faint 25% tint) -- every other mood sat there as a plain
// grey pill with no color hint, so this picker looked disconnected from the
// color language used everywhere else in the app (calendar, emotion pills,
// chat). A solid dot now marks every option regardless of selection state,
// same as ChatPage's mood picker.
// Same runtime-arbitrary-value problem as MOOD_BG_CLASS used to have --
// `bg-[${hex}]/25` is assembled at runtime so Tailwind's JIT scanner never
// sees it and generates no CSS for it. Selected mood buttons were rendering
// with zero background/border tint, indistinguishable from unselected ones
// except by the aria-pressed state. Fixed with an inline-style helper.
function selectedMoodStyle(mood) {
  const hex = MOOD_HEX[mood];
  if (!hex) return {};
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.25)`,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.5)`,
  };
}

// Lightweight local keyword heuristic, not a network call -- runs entirely
// client-side on every keystroke, so it has to be cheap. Researched against
// how real AI journaling tools (Dayora and similar) describe their mood
// detection: layered linguistic analysis in the sophisticated versions, but
// even the simple version is keyword/lexicon-based sentiment matching, which
// is exactly this. Deliberately a SUGGESTION the person can accept or
// ignore, never an auto-applied mood -- the whole point of picking a mood is
// that it's a real, honest self-report, not something the app decides for
// you. The keyword list + matching function now live in
// ../utils/moodSuggestion so ChatPage's quick-journal composer can offer the
// exact same suggestion instead of a second, drifting copy.

// "Prompt" used to be a third tab here, sharing sidebar space with
// Health/Last entry -- meaning the actual writing prompt was often one tap
// away and invisible by default, on the one page whose entire job is to get
// someone to start writing. Moved into the composer itself (see the banner
// right above the title field) where it's the first thing anyone sees when
// they land on a blank page, instead of a tab they might never click.
const supportTabs = [
  { id: "health", label: "Health" },
  { id: "entry", label: "Last entry" },
];

// Guided starting points, same idea as Stoic's scenario prompts and Day
// One's entry templates -- previously the composer was always a single
// blank textarea, which is fine for someone who already knows what they
// want to say but is a real barrier for someone who opened the app wanting
// to write but doesn't know where to start. Picking one pre-fills a
// lightly-structured starter (still fully editable) plus a suggested mood;
// it never overwrites an in-progress draft without asking first.
const templates = [
  {
    id: "gratitude",
    label: "Gratitude",
    mood: "happy",
    starter: "Three things I'm grateful for today:\n1. \n2. \n3. \n\nWhy they mattered:\n",
  },
  {
    id: "morning",
    label: "Morning pages",
    mood: "reflective",
    starter: "How I'm arriving this morning:\n\nWhat's on my mind before the day starts:\n\nOne intention for today:\n",
  },
  {
    id: "evening",
    label: "Evening reflection",
    mood: "calm",
    starter: "Today in a few words:\n\nWhat went well:\n\nWhat I'd do differently:\n\nHow I'm feeling as the day ends:\n",
  },
  {
    id: "conflict",
    label: "Conflict processing",
    mood: "stressed",
    starter: "What happened:\n\nWhat I felt in the moment:\n\nWhat I actually needed:\n\nWhat I want to do next:\n",
  },
];

// A small, CSS-only "preview of this entry as a memory" -- reacts live to
// mood (or the suggested mood, before it's accepted), the Keepsake toggle,
// and whether a Time Capsule date is set, tying all three of those separate
// controls into one glanceable visual instead of three unrelated buttons.
// Deliberately not a rebuild of the real Keepsakes globe (MemoryOrbGlobe.jsx
// is a full three.js scene) -- this is a lightweight gesture toward it
// (same warm glow language, same mood colors) sized for sitting inline in a
// form, not a second 3D scene competing with the one already on Dashboard.
function EntryAura({ mood, keepsake, capsule }) {
  const hex = MOOD_HEX[mood] || "rgb(var(--signal))";
  return (
    <div className="flex items-center gap-3 py-1">
      <div
        className={`relative h-9 w-9 rounded-full shrink-0 ${keepsake ? "animate-pulse" : ""}`}
        style={{
          background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), ${hex})`,
          boxShadow: `0 0 ${keepsake ? 20 : 10}px ${hex}${keepsake ? "b0" : "60"}`,
        }}
      >
        {capsule && (
          <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-[#161f19] border border-ink/25 flex items-center justify-center">
            <Clock size={9} className="text-ink/70" />
          </span>
        )}
      </div>
      <div className="text-xs leading-tight">
        <p className="text-ink/55">This entry, as a memory</p>
        <p className="text-ink/50 capitalize">
          {capsule ? "Sealed until it opens" : keepsake ? "A Keepsake" : `Feeling ${mood}`}
        </p>
      </div>
    </div>
  );
}

export default function JournalPage() {
  const [searchParams] = useSearchParams();
  const reducedMotion = usePrefersReducedMotion();
  const cVariants = reducedMotion ? staticContainerVariants : containerVariants;
  const iVariants = reducedMotion ? staticItemVariants : itemVariants;
  // Write and History used to be two separate pages/nav destinations --
  // this is now one Journal section with two tabs instead, so there's no
  // separate "History" entry in the nav at all (see AppShell.jsx). Reads
  // ?view=history so the old /journal/history route (now a redirect to
  // /journal/new?view=history -- see App.jsx) and Dashboard's "View all"
  // link still land directly on the History tab instead of Write.
  const [view, setView] = useState(() => (searchParams.get("view") === "history" ? "history" : "write"));
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("reflective");
  const [tags, setTags] = useState("");
  // Opt-in only, off by default -- not every entry is a Keepsake. Previously
  // the "core memory" feature picked entries for you (today's, or whatever
  // tied to your most recurring theme); this is a real choice made once, at
  // write time, per entry.
  const [isKeepsake, setIsKeepsake] = useState(false);
  // Time capsule -- off by default. When on, `capsuleDate` (yyyy-mm-dd) is
  // sent as this entry's revealAt; the entry then stays hidden from every
  // normal listing (Recent Entries, History, search, On This Day, theme
  // cloud, mood calendar) until that date, backed by the revealAt guards in
  // journal/routes.js and dashboard/routes.js.
  const [isCapsule, setIsCapsule] = useState(false);
  const [capsuleDate, setCapsuleDate] = useState("");
  const [capsules, setCapsules] = useState({ waiting: [], ready: [] });
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState(null);
  const [relatedEntry, setRelatedEntry] = useState(null);
  const [supportTab, setSupportTab] = useState("health");
  const [draftRestoredAt, setDraftRestoredAt] = useState(null);
  const [onThisDay, setOnThisDay] = useState([]);
  const [openMemory, setOpenMemory] = useState(null);
  const [themeCloud, setThemeCloud] = useState([]);
  const [rebuildingThemes, setRebuildingThemes] = useState(false);
  const [searchPreset, setSearchPreset] = useState(null);
  const hydratedFromDraft = useRef(false);
  const draftSaveTimer = useRef(null);

  const moodClass = useMemo(() => `mood-${mood}`, [mood]);
  const wordCount = useMemo(() => {
    const trimmed = content.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [content]);
  const suggestedMood = useMemo(() => suggestMoodFromText(content), [content]);

  useEffect(() => {
    apiFetch("/api/health-data/overview")
      .then((data) => setHealth(data?.latest || null))
      .catch(() => {});
    apiFetch("/api/journal/recent")
      .then((data) => setRelatedEntry((data?.entries || [])[0] || null))
      .catch(() => {});
    // "On This Day" -- entries from the same calendar date in past years
    // (see GET /api/journal/on-this-day). Only rendered below if there's an
    // actual match; a new/young account will honestly show nothing here
    // rather than an empty placeholder card, same pattern the rest of the
    // app already uses for "not enough data yet" states.
    apiFetch("/api/journal/on-this-day")
      .then((data) => setOnThisDay(data?.entries || []))
      .catch(() => {});
    // Theme cloud -- word-frequency across this user's ENTIRE history (see
    // GET /api/journal/theme-cloud), meant as writing fuel ("what do I tend
    // to write about") while composing, not another analytics view. See the
    // full-width section below for why this is deliberately NOT the same
    // data as Retrospect's recency-scoped recurringThemes.
    apiFetch("/api/journal/theme-cloud")
      .then((data) => setThemeCloud(data?.themes || []))
      .catch(() => {});
    // Time capsules -- see GET /api/journal/capsules. `waiting` never
    // includes title/content (even from this endpoint, a capsule you wrote
    // yourself stays sealed until its date), `ready` is a full entry you can
    // open.
    apiFetch("/api/journal/capsules")
      .then((data) => setCapsules({ waiting: data?.waiting || [], ready: data?.ready || [] }))
      .catch(() => {});

    // Restore an unsaved draft, if one exists from a previous visit that
    // never got saved (tab closed, accidental navigation, etc.). Runs once
    // on mount, before the debounced-save effect below has a chance to
    // immediately overwrite it with the initial empty state.
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const draft = raw ? JSON.parse(raw) : null;
      if (draft && draft.content && draft.content.trim()) {
        setTitle(draft.title || "");
        setContent(draft.content || "");
        setMood(draft.mood || "reflective");
        setTags(draft.tags || "");
        setIsKeepsake(draft.isKeepsake === true);
        setDraftRestoredAt(draft.savedAt || null);
      }
    } catch {
      // Corrupt/unreadable draft -- ignore rather than block the page.
    } finally {
      hydratedFromDraft.current = true;
    }
  }, []);

  // Debounced autosave -- waits for a short pause in typing rather than
  // writing to localStorage on every keystroke. Skipped entirely while
  // content is empty (nothing worth saving) and on the very first render
  // (before the restore effect above has run), so restoring a draft doesn't
  // immediately re-save an identical copy of itself.
  useEffect(() => {
    if (!hydratedFromDraft.current) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    if (!content.trim()) return;
    draftSaveTimer.current = setTimeout(() => {
      const savedAt = new Date().toISOString();
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content, mood, tags, isKeepsake, savedAt }));
        setDraftRestoredAt(savedAt);
      } catch {
        // localStorage unavailable/full -- autosave is a convenience, not
        // required for the actual Save button to work, so fail silently.
      }
    }, 600);
    return () => clearTimeout(draftSaveTimer.current);
  }, [title, content, mood, tags, isKeepsake]);

  function discardDraft() {
    if (!window.confirm("Discard this draft? This can't be undone.")) return;
    localStorage.removeItem(DRAFT_KEY);
    setTitle("");
    setContent("");
    setTags("");
    setIsKeepsake(false);
    setMood("reflective");
    setDraftRestoredAt(null);
  }

  // Rebuilds theme extraction for every existing entry against the current
  // (fixed) stopword list -- see server/src/shared/utils/extractThemes.js.
  // Older entries were tagged before filler/hedge words ("actually",
  // "instead", "think", "month"...) were excluded, so this cloud showed
  // those instead of real topics until re-run. Self-scoped, idempotent,
  // POST /api/journal/recompute-themes.
  async function rebuildThemes() {
    setRebuildingThemes(true);
    try {
      await apiFetch("/api/journal/recompute-themes", { method: "POST" });
      const data = await apiFetch("/api/journal/theme-cloud");
      setThemeCloud(data?.themes || []);
    } catch {
      // Best-effort -- the cloud just stays as it was if this fails.
    } finally {
      setRebuildingThemes(false);
    }
  }

  function toggleCapsule() {
    setIsCapsule((v) => {
      const next = !v;
      // Defaults to 30 days out the first time someone turns this on, so
      // they land on a real, already-valid date instead of an empty picker
      // -- still fully editable before saving.
      if (next && !capsuleDate) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        setCapsuleDate(d.toISOString().slice(0, 10));
      }
      return next;
    });
  }

  function applyTemplate(t) {
    if (content.trim() && !window.confirm("Replace your current draft with this template?")) return;
    setContent(t.starter);
    setMood(t.mood);
    if (!title.trim()) setTitle(t.label);
  }

  async function save() {
    if (!content.trim() || saving) return;
    // Was previously guarded only by the button label changing to "Saving..."
    // -- the button itself stayed clickable the whole time, so a double-click
    // (or one more click while a slow connection was still in flight) fired
    // a second identical POST and created a duplicate entry. This flag both
    // short-circuits a re-entrant call here and disables the button below.
    setSaving(true);
    setStatus("Saving...");
    try {
      // Previously title/tags were never sent as real fields -- they were
      // mashed into the content string itself, so there was no way to
      // search/filter by tag and no actual title stored anywhere. Both are
      // now real fields on the entry.
      const parsedTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const revealAt = isCapsule && capsuleDate ? new Date(`${capsuleDate}T09:00:00`).toISOString() : undefined;
      await apiFetch("/api/journal/quick-entry", {
        method: "POST",
        body: JSON.stringify({
          content,
          mood,
          title: title.trim() || undefined,
          tags: parsedTags.length ? parsedTags : undefined,
          isKeepsake,
          revealAt,
        }),
      });
      // Previously the form kept the saved text in place with only a small
      // status label changing to "Saved" -- easy to miss, and easy to
      // accidentally hit Save again and create a duplicate entry. Now the
      // form actually clears once the save is confirmed.
      const sealedUntil = revealAt ? new Date(revealAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : null;
      setTitle("");
      setContent("");
      setTags("");
      setIsKeepsake(false);
      setIsCapsule(false);
      setCapsuleDate("");
      setDraftRestoredAt(null);
      localStorage.removeItem(DRAFT_KEY);
      setStatus(sealedUntil ? `Sealed until ${sealedUntil}` : isKeepsake ? "Saved as a Keepsake" : "Saved");
      // Refresh the capsules list so a newly-sealed one shows up in the
      // "waiting" count right away instead of only after the next page load.
      if (revealAt) {
        apiFetch("/api/journal/capsules")
          .then((data) => setCapsules({ waiting: data?.waiting || [], ready: data?.ready || [] }))
          .catch(() => {});
      }
    } catch (err) {
      // Previously this discarded the real error entirely and always showed
      // the same generic "Save failed", regardless of the actual cause.
      setStatus(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={`ui-page living-bg ${view === "write" ? moodClass : ""}`}>
      {/* Write/History -- previously two separate pages with their own nav
          entries; now one Journal section, so there's exactly one place in
          the nav for "journaling" instead of two. See AppShell.jsx. */}
      <div className="max-w-6xl mx-auto mb-4">
        <div className="inline-flex gap-1 rounded-xl bg-paper-sunken p-1">
          {[
            { id: "write", label: "Write" },
            { id: "history", label: "History" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              aria-pressed={view === t.id}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                view === t.id ? "bg-signal text-white" : "text-ink/60 hover:text-ink/85"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {view === "history" && <JournalHistoryView />}

      {view === "write" && (
      <>
      <motion.div
        variants={cVariants}
        initial="hidden"
        animate="visible"
        className="max-w-6xl mx-auto grid xl:grid-cols-[1fr_320px] gap-4"
      >
        <motion.section variants={iVariants} className="ui-card rounded-2xl p-4 md:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="ui-kicker">New journal entry</p>
            {/* Real autosave, not decoration -- see the DRAFT_KEY comment
                and the debounced-save effect above. Only shown once there's
                actually something saved to point to. */}
            {draftRestoredAt && content.trim() && (
              <button type="button" onClick={discardDraft} className="text-[11px] text-ink/55 hover:text-ink/70">
                Discard draft
              </button>
            )}
          </div>
          {draftRestoredAt && (
            <p className="text-xs text-ink/60 -mt-1">
              Draft autosaved {new Date(draftRestoredAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          )}

          {/* Today's writing prompt, front and center -- previously this
              lived behind a "Prompt" tab in the sidebar's Writing Support
              widget, easy to never notice on the one page whose entire job
              is getting someone to actually start writing. A blank title
              field and an empty textarea right below a nav bar read as a
              stark, empty page (the "typewriter" feeling); this gives the
              page something to say before you've written anything. */}
          {!content.trim() && (
            <div className="rounded-xl border border-signal/25 bg-signal/[0.07] px-4 py-3.5 flex items-start gap-3">
              {/* Lightbulb, not Sparkles -- this is a plain rotating prompt
                  (todaysPrompt() below), not an AI-generated suggestion, so
                  the icon shouldn't imply "AI magic" for something that
                  isn't. */}
              <Lightbulb size={16} className="text-signal shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="ui-kicker text-ink-faint">Today's prompt</p>
                <p className="text-[15px] font-display italic text-ink/90 mt-1 leading-snug">{todaysPrompt()}</p>
              </div>
              <button
                type="button"
                onClick={() => setContent((c) => (c.trim() ? c : `${todaysPrompt()}\n\n`))}
                className="shrink-0 ml-auto text-xs text-signal hover:text-signal-soft underline underline-offset-2 self-center"
              >
                Start here
              </button>
            </div>
          )}

          {/* Guided templates -- see the `templates` array above. Plain text
              chips, not another colored badge row, consistent with the rest
              of the app's restrained styling. */}
          <div className="flex flex-wrap gap-2 pb-1">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                className="px-3 py-1.5 rounded-lg border border-ink/15 bg-ink/5 hover:bg-ink/10 text-xs"
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            className="ui-input"
            placeholder="Entry title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="relative">
            <textarea
              className="ui-input min-h-72"
              placeholder="Write freely..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            {/* Live word count -- small, functional, bottom-right corner of
                the textarea itself rather than a separate row, so it doesn't
                compete for attention with anything else on the page. */}
            {wordCount > 0 && (
              <span className="absolute bottom-2.5 right-3 text-[11px] text-ink/50 ui-mono pointer-events-none">
                {wordCount} {wordCount === 1 ? "word" : "words"}
              </span>
            )}
          </div>
          <FirstTimeTip id="composer-keepsake-capsule">
            Turn on <strong>Keepsake</strong> to flag an entry as one worth revisiting later, or write it as a{" "}
            <strong>Time Capsule</strong> to seal it until a future date -- both are optional, and independent of
            each other.
          </FirstTimeTip>

          {/* Keepsake and Time Capsule -- both opt-in, off by default, and
              independent of each other. Previously two full-width stacked
              rows sitting between the content and the actual mood/save
              controls; now one compact row so they read as secondary,
              optional flags rather than competing with the primary flow. */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsKeepsake((v) => !v)}
              aria-pressed={isKeepsake}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition ${
                isKeepsake
                  ? "border-[#e8ab5f]/60 bg-[#e8ab5f]/15 text-ink"
                  : "border-ink/15 bg-ink/5 text-ink/60 hover:border-ink/25 hover:text-ink/85"
              }`}
            >
              <Sparkles size={14} className={isKeepsake ? "text-[#e8ab5f]" : "text-ink/55"} />
              {isKeepsake ? "Saving as a Keepsake" : "Save as a Keepsake"}
            </button>
            <button
              type="button"
              onClick={toggleCapsule}
              aria-pressed={isCapsule}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition ${
                isCapsule
                  ? "border-[#a989b2]/60 bg-[#a989b2]/15 text-ink"
                  : "border-ink/15 bg-ink/5 text-ink/60 hover:border-ink/25 hover:text-ink/85"
              }`}
            >
              <Clock size={14} className={isCapsule ? "text-[#a989b2]" : "text-ink/55"} />
              {isCapsule ? "Sealed as a Time Capsule" : "Write it as a Time Capsule"}
            </button>
            {isCapsule && (
              <label className="inline-flex items-center gap-2 text-xs text-ink/60">
                Reveal on
                <input
                  type="date"
                  className="ui-input py-1.5 px-2.5 w-auto text-xs"
                  min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                  value={capsuleDate}
                  onChange={(e) => setCapsuleDate(e.target.value)}
                />
              </label>
            )}
          </div>
          {isCapsule && (
            <p className="text-xs text-ink/55 -mt-1">
              This entry won't appear anywhere in your journal -- not even to you -- until that date.
            </p>
          )}

          {/* Mood now comes right before Save, not after it -- previously
              this whole block (suggestion, preview, picker) sat BELOW the
              Save button, so the form's most important decision (how this
              entry actually feels) was answered after the "done" action
              already appeared, out of natural reading/tab order. */}
          <div>
            <p className="ui-kicker mb-2">How does this feel?</p>
            {suggestedMood && suggestedMood !== mood && (
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs text-ink/50">
                  This reads as <span className="capitalize text-ink/80">{suggestedMood}</span> to me.
                </p>
                <button
                  type="button"
                  onClick={() => setMood(suggestedMood)}
                  className="text-xs text-signal hover:text-signal-soft underline underline-offset-2"
                >
                  Use it
                </button>
              </div>
            )}
            <EntryAura mood={suggestedMood || mood} keepsake={isKeepsake} capsule={isCapsule} />
            <div className="flex flex-wrap gap-2 mt-2">
              {moods.map((m) => (
                <motion.button
                  key={m}
                  type="button"
                  onClick={() => setMood(m)}
                  aria-pressed={mood === m}
                  style={mood === m ? selectedMoodStyle(m) : undefined}
                  whileTap={reducedMotion ? undefined : { scale: 0.92 }}
                  animate={reducedMotion ? undefined : mood === m ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm capitalize ${
                    mood === m ? "" : "bg-ink/5 border-ink/10 hover:border-ink/20"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={moodDotStyle(m)} />
                  {m}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <input
              className="ui-input"
              placeholder="tags (comma separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <button
              className="px-5 min-h-11 ui-button-primary disabled:opacity-60"
              onClick={save}
              disabled={saving || !content.trim()}
            >
              {saving ? "Saving..." : "Save entry"}
            </button>
          </div>
          {/* Was previously mislabeled "Autosave status" even though there
              is no autosave -- saving only happens when the button above is
              clicked. Also stayed blank ("Idle") until the first save. */}
          {status && <p className="text-xs text-ink/60">Status: {status}</p>}
        </motion.section>

        <motion.aside variants={iVariants} className="ui-card rounded-2xl p-4 space-y-3 h-fit">
          {/* "On This Day" -- entries from this exact calendar date in past
              years (GET /api/journal/on-this-day). Day One's single
              most-cited feature, and it costs nothing to build here since
              the data already exists; researched and added deliberately,
              not filler. Only rendered once there's a real match -- a
              young account honestly shows nothing rather than an empty
              placeholder card. */}
          {onThisDay.length > 0 && (
            <div className="pb-3 border-b border-ink/10 space-y-2">
              <h3 className="font-medium flex items-center gap-1.5">On this day</h3>
              {onThisDay.map((entry) => (
                <button
                  key={entry._id}
                  type="button"
                  onClick={() => setOpenMemory(entry)}
                  className="w-full text-left surface p-2.5 hover:bg-ink/10 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-ink/50">
                      {entry.yearsAgo} {entry.yearsAgo === 1 ? "year" : "years"} ago
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full" style={moodDotStyle(entry.mood)} />
                  </div>
                  <p className="text-sm mt-1">{entry.title || truncateAtWord(entry.content, 70)}</p>
                </button>
              ))}
            </div>
          )}

          {/* Time capsules waiting to open, and any that have already
              passed their reveal date -- see GET /api/journal/capsules.
              Only rendered once there's actually at least one, same honest
              "nothing to show yet" pattern as On This Day above. */}
          {(capsules.waiting.length > 0 || capsules.ready.length > 0) && (
            <div className="pb-3 border-b border-ink/10 space-y-2">
              <h3 className="font-medium flex items-center gap-1.5">
                <Mail size={14} className="text-ink/50" />
                Time capsules
              </h3>
              {capsules.ready.map((entry) => (
                <button
                  key={entry._id}
                  type="button"
                  onClick={() => setOpenMemory(entry)}
                  className="w-full text-left surface p-2.5 hover:bg-ink/10 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-signal">Ready to open</span>
                    <span className="h-1.5 w-1.5 rounded-full" style={moodDotStyle(entry.mood)} />
                  </div>
                  <p className="text-sm mt-1">{entry.title || "A sealed entry, now open"}</p>
                </button>
              ))}
              {capsules.waiting.map((c) => (
                <div key={c._id} className="surface p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-ink/50">
                      Opens{" "}
                      {new Date(c.revealAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full" style={moodDotStyle(c.mood)} />
                  </div>
                  <p className="text-sm mt-1 text-ink/50">Still sealed</p>
                </div>
              ))}
            </div>
          )}

          {/* Previously the only way to see an old entry from this page was
              the single-line "Related previous entry" card below -- no way
              to browse everything written so far. Now switches this same
              page over to its History tab (see the `view` state above)
              instead of navigating to a separate route. */}
          <button
            type="button"
            onClick={() => setView("history")}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-ink/15 bg-ink/5 hover:bg-ink/10 transition text-sm"
          >
            <span className="inline-flex items-center gap-2">
              <BookOpen size={15} />
              Browse all entries
            </span>
            <span className="text-ink/55">&rarr;</span>
          </button>

          <MemorySearch presetQuery={searchPreset} />

          {/* Structural change, not a reskin -- previously three full-width
              cards were always stacked here permanently (health stats +
              writing prompt + related entry all visible at once, taking up
              most of the sidebar's height). Now it's one switchable panel:
              three compact icon tabs pick which single card shows below,
              same "focus on one thing at a time" pattern as Health page's
              new tabs. */}
          <div className="pt-4 border-t border-ink/10">
            <h3 className="font-medium mb-3">Writing support</h3>
            {/* Plain text tabs (underline for the active one) instead of
                colored, bordered, tinted buttons -- one accent color used
                once (the active underline), not a different color per tab. */}
            <div className="flex gap-4 border-b border-ink/10">
              {supportTabs.map((t) => {
                const active = supportTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSupportTab(t.id)}
                    aria-pressed={active}
                    className={`pb-2 text-xs border-b-2 -mb-px transition ${
                      active ? "border-signal text-ink" : "border-transparent text-ink/60 hover:text-ink/70"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {supportTab === "health" && (
              <div className="mt-3">
                {/* gap-x-3 -- this sidebar column is even narrower than
                    Dashboard's Health Snapshot card, and shows the exact
                    same steps/stress fields that proved to collide there
                    (e.g. a real 4-digit steps average like 8200 sitting
                    right against the stress score with zero gap). Same
                    fix, same reason. */}
                {health ? (
                  <div className="grid grid-cols-3 gap-x-3">
                    <div>
                      <p className="text-lg font-medium">{health.sleepHours ?? "--"}h</p>
                      <p className="text-xs text-ink/60 mt-0.5">Sleep</p>
                    </div>
                    <div className="border-l border-ink/10 pl-3">
                      <p className="text-lg font-medium">{health.steps ?? "--"}</p>
                      <p className="text-xs text-ink/60 mt-0.5">Steps</p>
                    </div>
                    <div className="border-l border-ink/10 pl-3">
                      <p className="text-lg font-medium">{health.stressScore ?? "--"}</p>
                      <p className="text-xs text-ink/60 mt-0.5">Stress</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-ink/60">No health data logged yet.</p>
                )}
              </div>
            )}

            {supportTab === "entry" && (
              <button type="button" onClick={() => setView("history")} className="block w-full text-left mt-3 group">
                <p className="text-sm text-ink/75 group-hover:text-ink/95">
                  {relatedEntry
                    ? `${new Date(relatedEntry.createdAt).toDateString()}: ${relatedEntry.title || truncateAtWord(relatedEntry.content, 60) || "Untitled entry"}`
                    : "No previous entries yet."}
                </p>
              </button>
            )}
          </div>
        </motion.aside>
      </motion.div>

      {/* Theme cloud -- full width, its own section below the composer, so
          it gets real room to breathe rather than being squeezed into the
          320px sidebar. Backed by GET /api/journal/theme-cloud (word
          frequency across this user's ENTIRE journal, not the last 20
          entries Retrospect's recurringThemes uses) -- framed here as
          writing fuel ("what do you tend to write about"), and clicking one
          runs it through the semantic search in the sidebar above rather
          than just sitting there as decoration. Only rendered once there's
          real data.
          Previously each word rendered at a font size scaled 12px-28px by
          frequency with no legend explaining why -- a real "why is 'work'
          huge and 'gym' tiny" confusion, the classic problem with word
          clouds as a data-viz choice. Same chip treatment History's tag
          filter uses instead: one consistent size, frequency shown as an
          actual number in a badge rather than implied by font size. */}
      {themeCloud.length > 0 && (
        <div className="max-w-6xl mx-auto mt-4">
          <div className="ui-card rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="ui-kicker">What you write about</p>
                <p className="text-xs text-ink/50 mt-1">
                  Your most recurring journal themes, most-written-about first. Click one to search for it.
                </p>
              </div>
              <button
                type="button"
                onClick={rebuildThemes}
                disabled={rebuildingThemes}
                title="Re-scan entries for themes using the current filter rules"
                className="shrink-0 text-[11px] text-ink/45 hover:text-ink/75 disabled:opacity-50 whitespace-nowrap"
              >
                {rebuildingThemes ? "Rebuilding…" : "Rebuild"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {themeCloud.map((t) => (
                <button
                  key={t.theme}
                  type="button"
                  onClick={() => setSearchPreset({ query: t.theme, token: Date.now() })}
                  className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-lg border border-ink/10 bg-ink/5 hover:bg-ink/10 hover:border-ink/20 transition text-sm capitalize"
                  title={`${t.count} ${t.count === 1 ? "entry" : "entries"}`}
                >
                  {t.theme.replace(/_/g, " ")}
                  <span className="ui-mono text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-ink/10 text-ink/50">
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {openMemory && (
        <EntryModal
          entry={openMemory}
          onClose={() => setOpenMemory(null)}
          onUpdated={(updated) => {
            setOpenMemory(updated);
            setOnThisDay((prev) => prev.map((e) => (e._id === updated._id ? { ...e, ...updated } : e)));
            setCapsules((prev) => ({
              waiting: prev.waiting,
              ready: prev.ready.map((e) => (e._id === updated._id ? { ...e, ...updated } : e)),
            }));
          }}
          onDeleted={(id) => {
            setOnThisDay((prev) => prev.filter((e) => e._id !== id));
            setCapsules((prev) => ({ waiting: prev.waiting, ready: prev.ready.filter((e) => e._id !== id) }));
          }}
        />
      )}
      </>
      )}
    </main>
  );
}

// Meaning-based search over the user's own past entries, backed by GET
// /api/journal/search (see server/src/modules/journal/routes.js +
// shared/services/embeddings.js) -- finds entries by what they're actually
// about, not just exact word overlap, e.g. "struggling to focus at work"
// can surface an entry that only ever says "kept switching tasks and felt
// scattered." Searches on submit rather than as-you-type: each search is a
// real Ollama embedding call, not a free client-side filter.
function MemorySearch({ presetQuery }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [mode, setMode] = useState("empty_query");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Previously a search result was a dead end -- you could see a title and
  // an excerpt but had no way to open the full entry, unlike every other
  // place an entry appears in the app (Dashboard, History, Capsules, On
  // This Day all open EntryModal on click). Just the id, since /search only
  // returns an excerpt, not full content -- EntryModalById fetches the rest.
  const [openEntryId, setOpenEntryId] = useState(null);

  async function runSearch(e, overrideQuery) {
    e?.preventDefault();
    const q = (overrideQuery ?? query).trim();
    if (!q) {
      setResults([]);
      setMode("empty_query");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch(`/api/journal/search?q=${encodeURIComponent(q)}`);
      setResults(data.results || []);
      setMode(data.mode);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  // Driven by the theme cloud below the composer -- clicking a theme word
  // fills this box and runs the same real search a manual query would,
  // rather than being a dead label. `token` (not just the query string)
  // forces this to re-fire even if someone clicks the same theme twice in a
  // row, since the query string alone wouldn't change.
  useEffect(() => {
    if (!presetQuery?.query) return;
    setQuery(presetQuery.query);
    runSearch(null, presetQuery.query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetQuery?.token]);

  return (
    <div className="space-y-3">
      <h3 className="font-medium">Search your memories</h3>
      <p className="text-xs text-ink/60">
        Search by meaning, not exact words -- "struggling to focus at work" can find entries that never say those
        words.
      </p>
      <form onSubmit={runSearch} className="flex gap-2">
        <input
          className="ui-input flex-1"
          placeholder="What are you looking for?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="px-4 min-h-11 ui-button-primary shrink-0" disabled={busy}>
          {busy ? "..." : "Search"}
        </button>
      </form>

      {error && <p className="text-xs text-red-300">{error}</p>}
      {mode === "unavailable" && (
        <p className="text-xs text-ink/50">
          Semantic search isn't set up for your entries yet -- run the embedding backfill on the server
          (`npm run embed-journals`).
        </p>
      )}
      {mode === "no_match" && <p className="text-xs text-ink/50">No closely related entries found for that.</p>}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setOpenEntryId(r.id)}
              className="surface p-2.5 w-full text-left hover:bg-ink/10 transition"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-ink/50">{new Date(r.createdAt).toLocaleDateString()}</p>
                <span className="text-[10px] text-ink/55">{Math.round(r.score * 100)}% match</span>
              </div>
              <p className="text-sm mt-1">{r.title || truncateAtWord(r.excerpt, 90)}</p>
              {r.title && <p className="text-xs text-ink/60 mt-0.5">{truncateAtWord(r.excerpt, 90)}</p>}
            </button>
          ))}
        </div>
      )}

      {openEntryId && (
        <EntryModalById
          entryId={openEntryId}
          apiFetch={apiFetch}
          onClose={() => setOpenEntryId(null)}
          onDeleted={() => {
            setOpenEntryId(null);
            setResults((prev) => prev.filter((r) => r.id !== openEntryId));
          }}
        />
      )}
    </div>
  );
}
