import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiFetch, describeError } from "../api";
import { useAuth } from "../context/AuthContext";

const moodOptions = ["happy", "calm", "reflective", "sad", "stressed", "angry"];
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
// globe for those exact two moods. Also unified angry's Tailwind named color
// to the same #ef4444 hex used elsewhere, for one source of truth.
const moodColor = {
  happy: "bg-[#e8ab5f]/80",
  calm: "bg-[#8eb184]/80",
  reflective: "bg-[#a989b2]/80",
  sad: "bg-[#84689d]/80",
  stressed: "bg-[#da8b5b]/80",
  angry: "bg-[#ef4444]/80",
};

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
  const [themeMode] = useState("midnight");
  const [writingMode] = useState("focus");
  const [ambientOn] = useState(true);
  const [recentEntries, setRecentEntries] = useState([]);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [smartPrompt, setSmartPrompt] = useState("");
  const [meta, setMeta] = useState({ readiness: { score: 0, label: "Low" }, confidence: 0 });
  const [chatMode, setChatMode] = useState("quick");
  const [responseStyle, setResponseStyle] = useState(50);
  const [useMemory, setUseMemory] = useState(true);
  const [statusText, setStatusText] = useState("");
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const listRef = useRef(null);
  const endRef = useRef(null);

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
        body: JSON.stringify({ content: quickEntry, mood }),
      });
      setRecentEntries((prev) => [saved, ...prev].slice(0, 30));
      setSelectedEntryId(saved._id);
      setQuickEntry("");
      setQuickEntryStatus("Saved");
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
  const sparkline = recentEntries.slice(0, 14).reverse();
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

  return (
    <div
      className={`text-white flex flex-col theme-${themeMode} ${
        ambientOn ? "living-bg" : ""
      }`}
    >
      <main className="p-3 md:p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 h-full">
          <section className={`glass rounded-3xl flex flex-col min-h-[70vh] ${toneClass}`}>
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
                <Link to="/dashboard" className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10">
                  Home
                </Link>
              </div>
            </div>
            <div className="px-4 md:px-5 py-3 border-b border-white/10 space-y-3">
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
                      <details className="mt-3 rounded-lg bg-[#111827] p-2 border border-white/10 text-xs">
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
                  className={`flex-1 rounded-xl bg-[#1f2a22] p-3 border border-white/10 outline-none focus:border-[#8fae73] resize-none min-h-11 ${
                    writingMode === "typewriter" ? "text-lg leading-8" : ""
                  }`}
                  placeholder="Message ReflectAI... (Enter to send, Shift+Enter for new line)"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={onComposerKeyDown}
                />
                <button
                  className="rounded-xl px-5 bg-[#8fae73] hover:bg-[#9fbe83] text-slate-900 min-h-11 font-medium disabled:opacity-60"
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

          <aside className="glass rounded-3xl p-4 md:p-5 h-fit xl:sticky xl:top-6 space-y-4">
            <div>
              <p className="text-[#d9d2b0] text-xs uppercase tracking-wider">Quick Journal</p>
              <p className="text-sm text-white/70 mt-1">Capture your current state without leaving chat.</p>
            </div>
            <textarea
              className="w-full rounded-xl bg-[#1f2a22] p-3 border border-white/10 min-h-28 outline-none focus:border-[#8fae73]"
              value={quickEntry}
              onChange={(e) => setQuickEntry(e.target.value)}
              placeholder="How are you feeling today?"
            />
            <div className="grid grid-cols-2 gap-2">
              {moodOptions.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setMood(m)}
                  aria-pressed={mood === m}
                  className={`px-3 py-2 min-h-11 rounded-xl border text-sm flex items-center justify-center gap-2 ${
                    mood === m ? "bg-[#8fae73]/30 border-[#c5d7a6]" : "border-white/10"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${moodColor[m] || "bg-white/40"}`} />
                  <span>{moodMeta[m]?.label || m}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="w-full px-4 py-3 min-h-11 rounded-xl bg-[#8fae73] hover:bg-[#9fbe83] text-slate-900 font-medium disabled:opacity-60"
              onClick={saveQuickEntry}
              disabled={savingQuickEntry || !quickEntry.trim()}
            >
              {savingQuickEntry ? "Saving..." : "Save Journal Entry"}
            </button>
            {quickEntryStatus && (
              <p className={`text-xs ${quickEntryStatus === "Saved" ? "text-[#c5d7a6]" : "text-red-300"}`}>
                {quickEntryStatus}
              </p>
            )}

            <div className="border-t border-white/10 pt-4 space-y-3">
              <p className="text-[#d9d2b0] text-xs uppercase tracking-wider">Emotional Timeline</p>
              <div className="flex items-end gap-1 h-8">
                {sparkline.map((entry) => (
                  <button
                    key={entry._id}
                    type="button"
                    title={`${new Date(entry.createdAt).toDateString()} • ${entry.mood}`}
                    onClick={() => setSelectedEntryId(entry._id)}
                    className={`w-3 rounded-t ${moodColor[entry.mood] || "bg-white/40"} ${
                      selectedEntryId === entry._id ? "h-8 ring-1 ring-white/80" : "h-5"
                    }`}
                  />
                ))}
              </div>
              <div className="max-h-48 overflow-y-auto scroll-area space-y-2">
                {recentEntries.map((entry) => (
                  <button
                    key={entry._id}
                    type="button"
                    onClick={() => setSelectedEntryId(entry._id)}
                    className={`w-full text-left rounded-xl p-2 border transition ${
                      selectedEntryId === entry._id
                        ? "bg-white/10 border-white/30"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <p className="text-[11px] text-white/60">
                      {new Date(entry.createdAt).toDateString()} • {entry.mood}
                    </p>
                    <p className="text-xs line-clamp-2 text-white/80">{entry.content}</p>
                  </button>
                ))}
              </div>
              {selectedEntry && (
                <div className="rounded-xl p-3 bg-[#111827] border border-white/10">
                  <p className="text-[11px] text-[#d9d2b0]">
                    {new Date(selectedEntry.createdAt).toDateString()} • {selectedEntry.mood}
                  </p>
                  <p className="text-sm text-white/85 mt-1">{selectedEntry.content}</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function confidenceLabel(confidence) {
  if (confidence >= 0.7) return "Grounded in your entries";
  if (confidence >= 0.4) return "Partially grounded";
  return "General reflection";
}

