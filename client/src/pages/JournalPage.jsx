import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Clock, Mail, Sparkles } from "lucide-react";
import { apiFetch, describeError } from "../api";
import EntryModal from "../components/EntryModal";
import FirstTimeTip from "../components/FirstTimeTip";
import JournalHistoryView from "./JournalHistoryPage";
import { suggestMoodFromText } from "../utils/moodSuggestion";

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

import { MOODS as moods, MOOD_HEX, MOOD_BG_CLASS as moodDotColors } from "../utils/moodColors";

// Same per-mood colors used on Dashboard/Chat (shared utils/moodColors.js),
// so the selected mood button actually reflects that mood's color everywhere
// in the app instead of a single generic "selected" color regardless of
// which mood was picked. Previously only the *selected* button got any
// color at all (a faint 25% tint) -- every other mood sat there as a plain
// grey pill with no color hint, so this picker looked disconnected from the
// color language used everywhere else in the app (calendar, emotion pills,
// chat). A solid dot now marks every option regardless of selection state,
// same as ChatPage's mood picker.
const moodColors = Object.fromEntries(
  Object.entries(MOOD_HEX).map(([mood, hex]) => [mood, `bg-[${hex}]/25 border-[${hex}]/50`])
);

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

const supportTabs = [
  { id: "prompt", label: "Prompt" },
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
  const hex = MOOD_HEX[mood] || "#8fae73";
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
          <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-[#161f19] border border-white/25 flex items-center justify-center">
            <Clock size={9} className="text-white/70" />
          </span>
        )}
      </div>
      <div className="text-xs leading-tight">
        <p className="text-white/55">This entry, as a memory</p>
        <p className="text-white/50 capitalize">
          {capsule ? "Sealed until it opens" : keepsake ? "A Keepsake" : `Feeling ${mood}`}
        </p>
      </div>
    </div>
  );
}

export default function JournalPage() {
  const [searchParams] = useSearchParams();
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
  const [health, setHealth] = useState(null);
  const [relatedEntry, setRelatedEntry] = useState(null);
  const [supportTab, setSupportTab] = useState("prompt");
  const [draftRestoredAt, setDraftRestoredAt] = useState(null);
  const [onThisDay, setOnThisDay] = useState([]);
  const [openMemory, setOpenMemory] = useState(null);
  const [themeCloud, setThemeCloud] = useState([]);
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
    if (!content.trim()) return;
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
    }
  }

  return (
    <main className={`ui-page living-bg ${view === "write" ? moodClass : ""}`}>
      {/* Write/History -- previously two separate pages with their own nav
          entries; now one Journal section, so there's exactly one place in
          the nav for "journaling" instead of two. See AppShell.jsx. */}
      <div className="max-w-6xl mx-auto mb-4">
        <div className="inline-flex gap-1 rounded-xl bg-black/20 p-1">
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
                view === t.id ? "bg-[#8fae73] text-[#16210f]" : "text-white/60 hover:text-white/85"
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
      <div className="max-w-6xl mx-auto grid xl:grid-cols-[1fr_320px] gap-4">
        <section className="ui-card rounded-2xl p-4 md:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="ui-kicker">New journal entry</p>
            {/* Real autosave, not decoration -- see the DRAFT_KEY comment
                and the debounced-save effect above. Only shown once there's
                actually something saved to point to. */}
            {draftRestoredAt && content.trim() && (
              <button type="button" onClick={discardDraft} className="text-[11px] text-white/55 hover:text-white/70">
                Discard draft
              </button>
            )}
          </div>
          {draftRestoredAt && (
            <p className="text-xs text-white/60 -mt-1">
              Draft autosaved {new Date(draftRestoredAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
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
                className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs"
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
              <span className="absolute bottom-2.5 right-3 text-[11px] text-white/50 ui-mono pointer-events-none">
                {wordCount} {wordCount === 1 ? "word" : "words"}
              </span>
            )}
          </div>
          <FirstTimeTip id="composer-keepsake-capsule">
            Turn on <strong>Keepsake</strong> to flag an entry as one worth revisiting later, or write it as a{" "}
            <strong>Time Capsule</strong> to seal it until a future date -- both are optional, and independent of
            each other.
          </FirstTimeTip>

          {/* Opt-in, off by default -- see the isKeepsake state comment
              above. Not every entry needs to be one; this only applies when
              someone actually turns it on for this specific entry. */}
          <button
            type="button"
            onClick={() => setIsKeepsake((v) => !v)}
            aria-pressed={isKeepsake}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition ${
              isKeepsake
                ? "border-[#e8ab5f]/60 bg-[#e8ab5f]/15 text-white"
                : "border-white/15 bg-white/5 text-white/60 hover:border-white/25 hover:text-white/85"
            }`}
          >
            <Sparkles size={14} className={isKeepsake ? "text-[#e8ab5f]" : "text-white/55"} />
            {isKeepsake ? "Saving as a Keepsake" : "Save as a Keepsake"}
          </button>

          {/* Time Capsule -- a letter to a future version of yourself. See
              the isCapsule state comment above and GET/POST revealAt in
              journal/routes.js. Off by default, and independent of
              Keepsake -- an entry can be neither, either, or both. */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={toggleCapsule}
              aria-pressed={isCapsule}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition ${
                isCapsule
                  ? "border-[#a989b2]/60 bg-[#a989b2]/15 text-white"
                  : "border-white/15 bg-white/5 text-white/60 hover:border-white/25 hover:text-white/85"
              }`}
            >
              <Clock size={14} className={isCapsule ? "text-[#a989b2]" : "text-white/55"} />
              {isCapsule ? "Sealed as a Time Capsule" : "Write it as a Time Capsule"}
            </button>
            {isCapsule && (
              <label className="inline-flex items-center gap-2 text-xs text-white/60">
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
            <p className="text-xs text-white/55 -mt-1">
              This entry won't appear anywhere in your journal -- not even to you -- until that date.
            </p>
          )}

          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <input
              className="ui-input"
              placeholder="tags (comma separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <button className="px-5 min-h-11 ui-button-primary" onClick={save}>
              Save entry
            </button>
          </div>
          {/* Was previously mislabeled "Autosave status" even though there
              is no autosave -- saving only happens when the button above is
              clicked. Also stayed blank ("Idle") until the first save. */}
          {status && <p className="text-xs text-white/60">Status: {status}</p>}
          {/* Local, keyword-based mood suggestion -- see MOOD_KEYWORDS /
              suggestMoodFromText above. Entirely client-side (no network
              call per keystroke), and only ever a suggestion someone can
              accept or dismiss -- picking your own mood is the point,
              this just makes it faster when what you wrote clearly leans
              one way. */}
          {suggestedMood && suggestedMood !== mood && (
            <div className="flex items-center gap-2 -mb-1">
              <p className="text-xs text-white/50">
                This reads as <span className="capitalize text-white/80">{suggestedMood}</span> to me.
              </p>
              <button
                type="button"
                onClick={() => setMood(suggestedMood)}
                className="text-xs text-[#8fae73] hover:text-[#a3c98d] underline underline-offset-2"
              >
                Use it
              </button>
            </div>
          )}
          <EntryAura mood={suggestedMood || mood} keepsake={isKeepsake} capsule={isCapsule} />
          <div className="flex flex-wrap gap-2">
            {moods.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMood(m)}
                aria-pressed={mood === m}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm capitalize ${
                  mood === m ? moodColors[m] : "bg-white/5 border-white/10 hover:border-white/20"
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${moodDotColors[m]}`} />
                {m}
              </button>
            ))}
          </div>
        </section>

        <aside className="ui-card rounded-2xl p-4 space-y-3 h-fit">
          {/* "On This Day" -- entries from this exact calendar date in past
              years (GET /api/journal/on-this-day). Day One's single
              most-cited feature, and it costs nothing to build here since
              the data already exists; researched and added deliberately,
              not filler. Only rendered once there's a real match -- a
              young account honestly shows nothing rather than an empty
              placeholder card. */}
          {onThisDay.length > 0 && (
            <div className="pb-3 border-b border-white/10 space-y-2">
              <h3 className="font-medium flex items-center gap-1.5">On this day</h3>
              {onThisDay.map((entry) => (
                <button
                  key={entry._id}
                  type="button"
                  onClick={() => setOpenMemory(entry)}
                  className="w-full text-left surface p-2.5 hover:bg-white/10 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-white/50">
                      {entry.yearsAgo} {entry.yearsAgo === 1 ? "year" : "years"} ago
                    </span>
                    <span className={`h-1.5 w-1.5 rounded-full ${moodDotColors[entry.mood] || "bg-white/30"}`} />
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
            <div className="pb-3 border-b border-white/10 space-y-2">
              <h3 className="font-medium flex items-center gap-1.5">
                <Mail size={14} className="text-white/50" />
                Time capsules
              </h3>
              {capsules.ready.map((entry) => (
                <button
                  key={entry._id}
                  type="button"
                  onClick={() => setOpenMemory(entry)}
                  className="w-full text-left surface p-2.5 hover:bg-white/10 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#8fae73]">Ready to open</span>
                    <span className={`h-1.5 w-1.5 rounded-full ${moodDotColors[entry.mood] || "bg-white/30"}`} />
                  </div>
                  <p className="text-sm mt-1">{entry.title || "A sealed entry, now open"}</p>
                </button>
              ))}
              {capsules.waiting.map((c) => (
                <div key={c._id} className="surface p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-white/50">
                      Opens{" "}
                      {new Date(c.revealAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <span className={`h-1.5 w-1.5 rounded-full ${moodDotColors[c.mood] || "bg-white/30"}`} />
                  </div>
                  <p className="text-sm mt-1 text-white/50">Still sealed</p>
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
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition text-sm"
          >
            <span className="inline-flex items-center gap-2">
              <BookOpen size={15} />
              Browse all entries
            </span>
            <span className="text-white/55">&rarr;</span>
          </button>

          <MemorySearch presetQuery={searchPreset} />

          {/* Structural change, not a reskin -- previously three full-width
              cards were always stacked here permanently (health stats +
              writing prompt + related entry all visible at once, taking up
              most of the sidebar's height). Now it's one switchable panel:
              three compact icon tabs pick which single card shows below,
              same "focus on one thing at a time" pattern as Health page's
              new tabs. */}
          <div className="pt-4 border-t border-white/10">
            <h3 className="font-medium mb-3">Writing support</h3>
            {/* Plain text tabs (underline for the active one) instead of
                colored, bordered, tinted buttons -- one accent color used
                once (the active underline), not a different color per tab. */}
            <div className="flex gap-4 border-b border-white/10">
              {supportTabs.map((t) => {
                const active = supportTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSupportTab(t.id)}
                    aria-pressed={active}
                    className={`pb-2 text-xs border-b-2 -mb-px transition ${
                      active ? "border-[#8fae73] text-white" : "border-transparent text-white/60 hover:text-white/70"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {supportTab === "prompt" && <p className="text-sm text-white/75 mt-3">{todaysPrompt()}</p>}

            {supportTab === "health" && (
              <div className="mt-3">
                {health ? (
                  <div className="grid grid-cols-3">
                    <div>
                      <p className="text-lg font-medium">{health.sleepHours ?? "--"}h</p>
                      <p className="text-xs text-white/60 mt-0.5">Sleep</p>
                    </div>
                    <div className="border-l border-white/10 pl-3">
                      <p className="text-lg font-medium">{health.steps ?? "--"}</p>
                      <p className="text-xs text-white/60 mt-0.5">Steps</p>
                    </div>
                    <div className="border-l border-white/10 pl-3">
                      <p className="text-lg font-medium">{health.stressScore ?? "--"}</p>
                      <p className="text-xs text-white/60 mt-0.5">Stress</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-white/60">No health data logged yet.</p>
                )}
              </div>
            )}

            {supportTab === "entry" && (
              <button type="button" onClick={() => setView("history")} className="block w-full text-left mt-3 group">
                <p className="text-sm text-white/75 group-hover:text-white/95">
                  {relatedEntry
                    ? `${new Date(relatedEntry.createdAt).toDateString()}: ${relatedEntry.title || truncateAtWord(relatedEntry.content, 60) || "Untitled entry"}`
                    : "No previous entries yet."}
                </p>
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* Theme cloud -- full width, its own section below the composer, so
          it gets real room to breathe rather than being squeezed into the
          320px sidebar. Backed by GET /api/journal/theme-cloud (word
          frequency across this user's ENTIRE journal, not the last 20
          entries Retrospect's recurringThemes uses) -- framed here as
          writing fuel ("what do you tend to write about"), and clicking one
          runs it through the semantic search in the sidebar above rather
          than just sitting there as decoration. Only rendered once there's
          real data. */}
      {themeCloud.length > 0 && (
        <div className="max-w-6xl mx-auto mt-4">
          <div className="ui-card rounded-2xl p-5">
            <p className="ui-kicker">What you write about</p>
            <p className="text-xs text-white/50 mt-1">
              Every recurring theme across your whole journal, sized by how often it shows up. Click one to search
              for it.
            </p>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 mt-4">
              {themeCloud.map((t, i) => {
                const max = themeCloud[0]?.count || 1;
                const min = themeCloud[themeCloud.length - 1]?.count || 1;
                const range = Math.max(1, max - min);
                const scale = (t.count - min) / range; // 0..1
                const size = 12 + Math.round(scale * 16); // 12px..28px
                const opacity = 0.45 + scale * 0.5;
                return (
                  <button
                    key={t.theme}
                    type="button"
                    onClick={() => setSearchPreset({ query: t.theme, token: Date.now() })}
                    className="capitalize hover:text-white transition leading-none"
                    style={{ fontSize: `${size}px`, color: `rgba(255,255,255,${opacity})` }}
                    title={`${t.count} ${t.count === 1 ? "entry" : "entries"}`}
                  >
                    {t.theme.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {openMemory && <EntryModal entry={openMemory} onClose={() => setOpenMemory(null)} />}
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
      <p className="text-xs text-white/60">
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
        <p className="text-xs text-white/50">
          Semantic search isn't set up for your entries yet -- run the embedding backfill on the server
          (`npm run embed-journals`).
        </p>
      )}
      {mode === "no_match" && <p className="text-xs text-white/50">No closely related entries found for that.</p>}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r) => (
            <div key={r.id} className="surface p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-white/50">{new Date(r.createdAt).toLocaleDateString()}</p>
                <span className="text-[10px] text-white/55">{Math.round(r.score * 100)}% match</span>
              </div>
              <p className="text-sm mt-1">{r.title || truncateAtWord(r.excerpt, 90)}</p>
              {r.title && <p className="text-xs text-white/60 mt-0.5">{truncateAtWord(r.excerpt, 90)}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
