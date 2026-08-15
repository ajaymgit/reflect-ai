import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Feather, PenSquare, RotateCcw, Sparkles, SlidersHorizontal } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { apiFetch, describeError } from "../api";
import { useAuth } from "../context/AuthContext";
import FirstTimeTip from "../components/FirstTimeTip";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";
import { suggestMoodFromText } from "../utils/moodSuggestion";
import { MOODS as moodOptions, MOOD_BG_CLASS } from "../utils/moodColors";

// Quick-journal draft autosave -- same pattern JournalPage's composer uses
// (see DRAFT_KEY there), so switching away from Chat mid-thought doesn't
// silently lose whatever was typed in the sidebar composer. Separate key
// from Write's own draft since these are two independent composers.
const CHAT_DRAFT_KEY = "equoria-chat-quickjournal-draft";

// Plain-language read on what a conversation has touched on so far, built
// from the same `focus` category each turn already returns (previously only
// used to tint the message pane's background, never surfaced as text) --
// the "what happened after the conversation" summary AI journaling apps like
// Rosebud/Mindsera show, instead of leaving the transcript as the only
// artifact of a session.
const FOCUS_LABEL = {
  emotional_safety: "some heavier feelings",
  positive_state: "what's been going well",
  relationships: "a relationship",
  general_reflection: "general reflection",
};

// Same stagger/entrance pattern the rest of the redesigned pages use --
// previously Chat rendered with a hard instant cut, the one page in regular
// daily use (alongside Settings) that never picked this up.
const pageVariants = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } };
const staticPageVariants = { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } };

// Previously used emoji (☀️🍃🌿) here while Dashboard and Journal used
// colored dots for the exact same six moods -- two different visual
// languages for the same concept. Unified to the colored-dot style below.
const moodMeta = {
  happy: { label: "Happy" },
  calm: { label: "Calm" },
  reflective: { label: "Reflective" },
  sad: { label: "Sad" },
  stressed: { label: "Stressed" },
  angry: { label: "Angry" },
};
const personas = [
  { id: "gentle", label: "Gentle listener", detail: "Warm, soft, validating -- emotion first." },
  { id: "stoic", label: "Stoic challenger", detail: "Calmer and more direct -- what's in your control vs. not." },
  { id: "cbt", label: "CBT reframer", detail: "Gently reframes all-or-nothing thinking before the question." },
];
const quickPrompts = [
  "Quick emotional check-in",
  "I feel stuck today",
  "Help me reflect on relationships",
  "I am feeling grateful",
];
// Previously reflective/sad used different, muted olive-green hexes here
// (#a7b899 / #7f8b74) that don't exist anywhere else in the app's mood
// palette -- they rendered as grey-green dots instead of the purple tones
// (#a989b2 / #84689d) used on Dashboard, the mood calendar, and the memory
// globe for those exact two moods. Now pulled from the same shared
// utils/moodColors.js every other page uses, one source of truth.
const moodColor = Object.fromEntries(
  Object.keys(MOOD_BG_CLASS).map((mood) => [mood, `${MOOD_BG_CLASS[mood]}/80`])
);
export default function ChatPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [message, setMessage] = useState(location.state?.prefill || "");
  const [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [quickEntry, setQuickEntry] = useState("");
  const [quickEntryStatus, setQuickEntryStatus] = useState("");
  const [savingQuickEntry, setSavingQuickEntry] = useState(false);
  const [mood, setMood] = useState("calm");
  const [isKeepsake, setIsKeepsake] = useState(false);
  const [themeMode] = useState("midnight");
  const [writingMode] = useState("focus");
  const [ambientOn] = useState(true);
  const [recentEntries, setRecentEntries] = useState([]);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [smartPrompt, setSmartPrompt] = useState("");
  const [meta, setMeta] = useState({ readiness: { score: 0, label: "Low" }, confidence: 0 });
  const [chatMode, setChatMode] = useState("quick");
  const [persona, setPersona] = useState("gentle");
  const [responseStyle, setResponseStyle] = useState(50);
  const [useMemory, setUseMemory] = useState(true);
  const [statusText, setStatusText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resettingChat, setResettingChat] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const hydratedDraft = useRef(false);
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const listRef = useRef(null);
  const endRef = useRef(null);

  // Restore an unsaved quick-journal draft, same reasoning as JournalPage's
  // composer: a refresh or accidental navigation away from Chat previously
  // lost whatever was typed in the sidebar with zero warning.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft?.content) {
          setQuickEntry(draft.content);
          setMood(draft.mood || "calm");
        }
      }
    } catch {
      // ignore -- worst case the draft just doesn't restore
    }
    hydratedDraft.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedDraft.current) return;
    try {
      if (quickEntry.trim()) {
        localStorage.setItem(CHAT_DRAFT_KEY, JSON.stringify({ content: quickEntry, mood }));
      } else {
        localStorage.removeItem(CHAT_DRAFT_KEY);
      }
    } catch {
      // ignore
    }
  }, [quickEntry, mood]);

  const suggestedQuickMood = useMemo(() => suggestMoodFromText(quickEntry), [quickEntry]);

  useEffect(() => {
    apiFetch("/api/chat/session")
      .then((data) => setTurns(data.turns || []))
      .catch(() => {});
    apiFetch("/api/journal/recent")
      .then((data) => {
        const entries = data.entries || [];
        setRecentEntries(entries);
        setSelectedEntryId(entries[0]?._id || null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, loading]);

  useEffect(() => {
    if (!recentEntries.length) {
      setSmartPrompt("Your story starts here. What is on your mind today?");
      return;
    }
    const counts = recentEntries.reduce((acc, entry) => {
      acc[entry.mood] = (acc[entry.mood] || 0) + 1;
      return acc;
    }, {});
    const topMood = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const promptByMood = {
      happy: "You have sounded positive lately. Want to capture what is working well?",
      calm: "Your entries feel steady. Want to reflect on what is helping you stay grounded?",
      reflective: "You are in a reflective phase. Want a deeper prompt to explore it?",
      sad: "You have mentioned heavier emotions. Want to write gently about what feels hardest?",
      stressed: "Stress has appeared often this week. Want a quick unpack prompt?",
      angry: "I noticed stronger intensity lately. Want to map what triggers it most?",
    };
    setSmartPrompt(promptByMood[topMood] || "What feels most important to write about right now?");
  }, [recentEntries]);

  // Plain-language "what this touched on" summary built from each turn's
  // existing `focus` field -- previously that data only ever drove a
  // background tint, and the transcript itself was the only artifact of a
  // conversation. Only shown once there's enough of a conversation for a
  // summary to mean anything.
  const conversationTopics = useMemo(() => {
    if (turns.length < 2) return [];
    const seen = new Set();
    const ordered = [];
    for (const t of turns) {
      const label = FOCUS_LABEL[t.focus] || FOCUS_LABEL.general_reflection;
      if (!seen.has(label)) {
        seen.add(label);
        ordered.push(label);
      }
    }
    return ordered;
  }, [turns]);

  // Clears both the visible thread and the server-side memory context (see
  // DELETE /api/chat/session) -- previously there was no way to start over
  // without the old thread reappearing on next load.
  async function newChat() {
    if (turns.length > 0 && !window.confirm("Start a new chat? This clears the current conversation.")) return;
    setResettingChat(true);
    try {
      await apiFetch("/api/chat/session", { method: "DELETE" });
      setTurns([]);
      setMeta({ readiness: { score: 0, label: "Low" }, confidence: 0 });
    } catch {
      // best-effort -- if the request fails the old thread just stays
    } finally {
      setResettingChat(false);
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    setStatusText(chatMode === "analysis" ? "Analyzing patterns..." : "Thinking...");
    const userMsg = message;
    const startedAt = Date.now();
    setMessage("");
    try {
      const data = await apiFetch("/api/chat/message", {
        method: "POST",
        body: JSON.stringify({
          message: userMsg,
          settings: {
            mode: chatMode,
            responseStyle,
            useMemory,
            persona,
          },
        }),
      });
      const complexityBoost = Math.min(1000, Math.floor(userMsg.trim().length * 18));
      const minHumanDelay = 280 + complexityBoost;
      const elapsed = Date.now() - startedAt;
      if (elapsed < minHumanDelay) {
        await sleep(minHumanDelay - elapsed);
      }
      const next = {
        userMessage: userMsg,
        aiResponse: data.payload.question,
        evidence: data.payload.evidence,
        confidence: data.payload.confidence,
        fallback: data.payload.fallback,
        reasoning: data.payload.reasoning,
        focus: data.payload.currentFocus || "general_reflection",
      };
      setTurns((prev) => [...prev, next]);
      setMeta({ readiness: data.readiness, confidence: data.payload.confidence });
    } catch (error) {
      const friendlyError =
        error?.message?.includes("Connection issue")
          ? "I am having a brief connection issue. Please try sending that again in a moment."
          : "I missed that because of a temporary issue. Could you send it one more time?";
      setTurns((prev) => [
        ...prev,
        {
          userMessage: userMsg,
          aiResponse: friendlyError,
          evidence: [],
          confidence: 0,
          fallback: true,
          reasoning: `Request failed before the chatbot could respond safely: ${error?.message || "unknown_error"}.`,
          focus: "general_reflection",
        },
      ]);
    } finally {
      setLoading(false);
      setStatusText("");
    }
  }

  async function saveQuickEntry() {
    if (!quickEntry.trim() || savingQuickEntry) return;
    setSavingQuickEntry(true);
    setQuickEntryStatus("");
    try {
      const saved = await apiFetch("/api/journal/quick-entry", {
        method: "POST",
        body: JSON.stringify({ content: quickEntry, mood, isKeepsake }),
      });
      setRecentEntries((prev) => [saved, ...prev].slice(0, 30));
      setSelectedEntryId(saved._id);
      setQuickEntry("");
      setIsKeepsake(false);
      setQuickEntryStatus(isKeepsake ? "Saved as a Keepsake" : "Saved");
      try {
        localStorage.removeItem(CHAT_DRAFT_KEY);
      } catch {
        // ignore
      }
    } catch (err) {
      // Previously this had no try/catch at all: a failure here was a silent
      // unhandled promise rejection -- no status shown, nothing cleared, the
      // user could easily believe a note saved when it didn't.
      setQuickEntryStatus(describeError(err));
    } finally {
      setSavingQuickEntry(false);
    }
  }

  function useQuickPrompt(prompt) {
    setMessage(prompt);
  }

  function onComposerKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!loading && message.trim()) {
        sendMessage(event);
      }
    }
  }

  const selectedEntry = recentEntries.find((e) => e._id === selectedEntryId) || null;
  const heroGreeting = new Date().getHours() < 16 ? "Good day" : "Good evening";
  const latestFocus = turns[turns.length - 1]?.focus || "general_reflection";
  const lastUserThread = turns
    .slice()
    .reverse()
    .find((t) => String(t.userMessage || "").trim().length > 10)?.userMessage;
  const toneClass =
    latestFocus === "emotional_safety"
      ? "bg-[#1a3a44]/20"
      : latestFocus === "positive_state"
        ? "bg-[#3a4f3a]/20"
        : latestFocus === "relationships"
          ? "bg-[#4a3550]/20"
          : "bg-[#1f2a22]/20";

  const activeModeLabel = { quick: "Quick chat", deep: "Deep reflection", analysis: "Pattern analysis" }[chatMode];
  const activePersonaLabel = personas.find((p) => p.id === persona)?.label || "Gentle listener";

  return (
    <div
      className={`text-white flex flex-col theme-${themeMode} ${
        ambientOn ? "living-bg" : ""
      }`}
    >
      <main className="p-3 md:p-6">
        <motion.div
          className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 h-full"
          variants={reducedMotion ? staticPageVariants : pageVariants}
          initial="hidden"
          animate="visible"
        >
          <section className={`glass rounded-2xl flex flex-col min-h-[70vh] ${toneClass}`}>
            <div className="p-4 md:p-5 border-b border-white/10 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-white/80">{heroGreeting}, {user?.name}</p>
                <p className="text-xs text-white/60 mt-1">{smartPrompt}</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Was a raw "Confidence 73%" badge -- reads like exposed
                    model internals rather than something meant for a
                    wellness app's end user, and it showed "Confidence 0%"
                    before you'd even sent a message. Now a plain-language
                    label, shown only once there's an actual response. */}
                {turns.length > 0 && (
                  <span className="text-xs px-3 py-1 rounded-full bg-[#8fae73]/25 border border-[#c5d7a6]/35">
                    {confidenceLabel(meta.confidence)}
                  </span>
                )}
                {turns.length > 0 && (
                  <button
                    type="button"
                    onClick={newChat}
                    disabled={resettingChat}
                    title="Clear this conversation and start fresh"
                    className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RotateCcw size={11} />
                    New chat
                  </button>
                )}
                <Link to="/dashboard" className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10">
                  Home
                </Link>
              </div>
            </div>
            {/* Consolidated into one compact row (always-visible summary +
                a toggle) instead of three stacked rows of pills that used to
                sit above the composer before a single message was even
                sent. Expanding reveals the exact same controls this used to
                show unconditionally. */}
            <div className="px-4 md:px-5 py-2.5 border-b border-white/10">
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                aria-expanded={settingsOpen}
                className="w-full flex items-center justify-between gap-2 text-xs text-white/70 hover:text-white transition"
              >
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal size={13} className="text-white/55" />
                  {activeModeLabel} · {activePersonaLabel}
                </span>
                <ChevronDown size={14} className={`text-white/55 transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
              </button>

              {settingsOpen && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "quick", label: "Quick chat" },
                      { id: "deep", label: "Deep reflection" },
                      { id: "analysis", label: "Pattern analysis" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setChatMode(item.id)}
                        aria-pressed={chatMode === item.id}
                        className={`text-xs px-3 py-2 rounded-full border ${
                          chatMode === item.id
                            ? "bg-[#8fae73]/30 border-[#c5d7a6]"
                            : "bg-white/5 border-white/10 hover:bg-white/10"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {/* Distinct coaching voices (see the persona rules block in
                      chat/service.js's prompt) -- previously Chat only ever
                      spoke in one fixed voice regardless of what kind of
                      reflection someone actually wanted right now. */}
                  <div className="flex flex-wrap gap-2">
                    {personas.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPersona(p.id)}
                        aria-pressed={persona === p.id}
                        title={p.detail}
                        className={`text-xs px-3 py-2 rounded-full border ${
                          persona === p.id
                            ? "bg-[#a989b2]/25 border-[#a989b2]/60"
                            : "bg-white/5 border-white/10 hover:bg-white/10"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-3 items-center">
                    <label className="text-xs text-white/70 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={useMemory}
                        onChange={(e) => setUseMemory(e.target.checked)}
                        className="accent-[#8fae73]"
                      />
                      Use journal memory
                    </label>
                    <label className="text-xs text-white/70 flex items-center gap-2">
                      <span className="shrink-0">Response style</span>
                      <input
                        className="w-full"
                        type="range"
                        min={0}
                        max={100}
                        value={responseStyle}
                        onChange={(e) => setResponseStyle(Number(e.target.value))}
                      />
                      <span className="text-[11px] text-white/55 shrink-0">
                        {responseStyle < 35 ? "Very gentle" : responseStyle < 70 ? "Balanced" : "Analytical"}
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* "What this touched on" -- see FOCUS_LABEL/conversationTopics
                above. Sits right under the controls so it reads as a summary
                of the conversation so far rather than competing with any
                single message. */}
            {conversationTopics.length > 0 && (
              <div className="px-4 md:px-5 py-2 border-b border-white/10">
                <p className="text-[11px] text-white/60">
                  So far: <span className="text-white/70">{conversationTopics.join(", ")}</span>
                </p>
              </div>
            )}

            {lastUserThread && (
              <div className="px-4 md:px-5 pt-3">
                <button
                  type="button"
                  onClick={() => setMessage(lastUserThread)}
                  className="w-full text-left text-xs rounded-xl px-3 py-2 bg-white/5 border border-white/10 hover:bg-white/10"
                >
                  Continue thread: "{lastUserThread.slice(0, 90)}{lastUserThread.length > 90 ? "..." : ""}"
                </button>
              </div>
            )}

            <div ref={listRef} className="flex-1 overflow-y-auto scroll-area p-4 md:p-6 space-y-4">
              {turns.length === 0 && (
                <div className="text-sm text-white/75 glass rounded-2xl p-4 max-w-2xl">
                  Start with anything. ReflectAI will respond like a normal chat and adapt as your topic changes.
                </div>
              )}

              {turns.map((turn, idx) => (
                <motion.div key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                  <div className="rounded-2xl p-3 max-w-2xl ml-auto bg-[#8fae73]/30 soft-border">
                    <p className="text-[11px] text-[#d9d2b0] mb-1">You</p>
                    <p className="text-sm leading-6">{turn.userMessage}</p>
                  </div>
                  <div className="glass rounded-2xl p-4 max-w-2xl">
                    <p className="text-[11px] text-[#d9d2b0] mb-1">ReflectAI</p>
                    <p className="text-sm leading-6">{turn.aiResponse}</p>
                    {turn.evidence?.length > 0 && (
                      <details className="mt-3 rounded-lg bg-black/30 p-2 border border-white/10 text-xs">
                        <summary className="cursor-pointer text-[#d9d2b0]">Why this response</summary>
                        <div className="mt-2 grid gap-2">
                          {turn.evidence.map((ev, i) => (
                            <div key={i} className="rounded-lg bg-white/5 p-2 border border-white/10">
                              <p className="text-[#d9d2b0]">
                                {ev.date ? new Date(ev.date).toDateString() : "Journal evidence"}
                              </p>
                              <p className="text-white/80">{ev.quote || "Related journal reference."}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </motion.div>
              ))}
              {loading && (
                <div className="glass rounded-2xl p-3 max-w-2xl">
                  <p className="text-[11px] text-[#d9d2b0] mb-1">ReflectAI</p>
                  {/* Was a static "Thinking..." line -- an animated indicator
                      reads as more alive while an actual response is being
                      generated. */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/70">{statusText || "Thinking"}</span>
                    <span className="flex items-center gap-1">
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#c5d7a6]" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#c5d7a6]" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#c5d7a6]" />
                    </span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="border-t border-white/10 p-4 md:p-5 space-y-3">
              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => useQuickPrompt(prompt)}
                    className="text-xs px-3 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-[#8fae73]/20"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <form onSubmit={sendMessage} className="flex gap-2 items-end">
                <textarea
                  rows={2}
                  // .ui-input -- same composer treatment JournalPage's
                  // textarea uses, instead of a one-off hardcoded
                  // bg-[#1f2a22]/border-white/10 combo that looked like a
                  // different, unstyled input next to the rest of the app.
                  className={`ui-input flex-1 resize-none min-h-11 ${
                    writingMode === "typewriter" ? "text-lg leading-8" : ""
                  }`}
                  placeholder="Message ReflectAI... (Enter to send, Shift+Enter for new line)"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={onComposerKeyDown}
                />
                <button
                  className="px-5 min-h-11 ui-button-primary"
                  disabled={loading || !message.trim()}
                >
                  Send
                </button>
              </form>
              <p className="text-xs text-white/60">
                ReflectAI supports self-reflection and is not a medical service.
              </p>
            </div>
          </section>

          <aside className="glass rounded-2xl p-4 md:p-5 h-fit xl:sticky xl:top-6 space-y-4">
            <div className="flex items-center gap-2">
              <PenSquare size={15} className="text-white/50" />
              <p className="text-sm font-medium">Quick journal</p>
            </div>
            <FirstTimeTip id="chat-quickjournal-keepsake">
              This composer now supports Keepsakes too -- flag an entry here the same way you can from Write.
            </FirstTimeTip>
            <textarea
              className="ui-input min-h-24"
              value={quickEntry}
              onChange={(e) => setQuickEntry(e.target.value)}
              placeholder="How are you feeling today?"
            />
            {/* Same local, keyword-based suggestion Write's composer uses
                (see ../utils/moodSuggestion) -- a dismissible suggestion
                someone can accept, never an auto-applied mood. */}
            {suggestedQuickMood && suggestedQuickMood !== mood && (
              <button
                type="button"
                onClick={() => setMood(suggestedQuickMood)}
                className="w-full text-left text-xs rounded-lg px-3 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white/70"
              >
                This reads as <span className="capitalize text-white">{suggestedQuickMood}</span> to me. Use it?
              </button>
            )}
            {/* Compact circle row instead of a 2-col grid of full-width
                labeled buttons -- same "row of circles" language as
                Dashboard's weekly streak row, and takes a third of the
                vertical space so the composer above doesn't get pushed down
                by six stacked buttons. Label only shows for the selected
                mood, right below the row, instead of on every button. */}
            <div>
              <div className="flex justify-between">
                {moodOptions.map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setMood(m)}
                    aria-pressed={mood === m}
                    title={moodMeta[m]?.label || m}
                    className={`h-9 w-9 rounded-full flex items-center justify-center border-2 transition ${
                      mood === m ? "border-white/70 scale-110" : "border-transparent opacity-70 hover:opacity-100"
                    } ${moodColor[m] || "bg-white/40"}`}
                  />
                ))}
              </div>
              <p className="text-xs text-white/60 text-center mt-2 capitalize">{moodMeta[mood]?.label || mood}</p>
            </div>
            {/* Same opt-in Keepsake flag Write's composer has -- previously
                saving from here always produced a plain entry with no way
                to flag it, a real capability gap versus the Write page. */}
            <button
              type="button"
              onClick={() => setIsKeepsake((v) => !v)}
              aria-pressed={isKeepsake}
              className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs transition ${
                isKeepsake
                  ? "border-[#e8ab5f]/60 bg-[#e8ab5f]/15 text-white"
                  : "border-white/15 bg-white/5 text-white/60 hover:border-white/25 hover:text-white/85"
              }`}
            >
              <Sparkles size={12} className={isKeepsake ? "text-[#e8ab5f]" : "text-white/55"} />
              {isKeepsake ? "Saving as a Keepsake" : "Save as a Keepsake"}
            </button>
            <button
              type="button"
              className="w-full px-4 py-3 min-h-11 ui-button-primary"
              onClick={saveQuickEntry}
              disabled={savingQuickEntry || !quickEntry.trim()}
            >
              {savingQuickEntry ? "Saving..." : "Save journal entry"}
            </button>
            {quickEntryStatus && (
              <p className={`text-xs ${quickEntryStatus.startsWith("Saved") ? "text-[#c5d7a6]" : "text-red-300"}`}>
                {quickEntryStatus}
              </p>
            )}

            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Feather size={15} className="text-white/50" />
                <p className="text-sm font-medium">Emotional timeline</p>
              </div>
              {/* One horizontal scrollable strip instead of two separate
                  elements (a bar-chart sparkline, then a whole separate
                  scrolling list below it) showing the same entries twice.
                  Each chip is just a date with a small mood-color dot --
                  color used as a functional indicator (like a status dot),
                  not a full tinted icon badge. */}
              <div className="flex gap-1 overflow-x-auto scroll-area pb-1 -mx-1 px-1">
                {recentEntries.map((entry) => {
                  const active = selectedEntryId === entry._id;
                  return (
                    <button
                      key={entry._id}
                      type="button"
                      title={`${new Date(entry.createdAt).toDateString()} • ${entry.mood}`}
                      onClick={() => setSelectedEntryId(entry._id)}
                      className={`shrink-0 flex flex-col items-center gap-1.5 rounded-lg px-2.5 py-2 transition ${
                        active ? "bg-white/10" : "hover:bg-white/5"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${moodColor[entry.mood] || "bg-white/40"}`} />
                      <span className="text-[10px] text-white/50 whitespace-nowrap">
                        {new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </button>
                  );
                })}
                {recentEntries.length === 0 && (
                  <p className="text-xs text-white/55 py-2 italic">Nothing here yet -- your first entry will show up as a chip.</p>
                )}
              </div>
              {selectedEntry && (
                <div className="rounded-xl p-3 bg-black/30 border border-white/10">
                  <p className="text-[11px] text-[#d9d2b0]">
                    {new Date(selectedEntry.createdAt).toDateString()} • {selectedEntry.mood}
                  </p>
                  <p className="text-sm text-white/85 mt-1">{selectedEntry.content}</p>
                </div>
              )}
            </div>
          </aside>
        </motion.div>
      </main>
    </div>
  );
}

function confidenceLabel(confidence) {
  if (confidence >= 0.7) return "Grounded in your entries";
  if (confidence >= 0.4) return "Partially grounded";
  return "General reflection";
}

