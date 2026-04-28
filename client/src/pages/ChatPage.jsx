import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import { Button, Card, PageHeader, PageState, StatusPill, ToggleButton } from "../ui";

const moodOptions = ["happy", "calm", "reflective", "sad", "stressed", "angry"];
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
const moodColor = {
  happy: "bg-mood-happy",
  calm: "bg-mood-calm",
  reflective: "bg-mood-reflective",
  sad: "bg-mood-sad",
  stressed: "bg-mood-stressed",
  angry: "bg-mood-angry",
};

export default function ChatPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [quickEntry, setQuickEntry] = useState("");
  const [mood, setMood] = useState("calm");
  const [settings, setSettings] = useState({ themeMode: "daylight", reducedMotion: false, privacyMode: false });
  const [recentEntries, setRecentEntries] = useState([]);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [smartPrompt, setSmartPrompt] = useState("");
  const [meta, setMeta] = useState({ readiness: { score: 0, label: "Low" }, confidence: 0 });
  const [chatMode, setChatMode] = useState("quick");
  const [responseStyle, setResponseStyle] = useState(50);
  const [useMemory, setUseMemory] = useState(true);
  const [statusText, setStatusText] = useState("");
  const [loadError, setLoadError] = useState("");
  const [quickEntryStatus, setQuickEntryStatus] = useState("");
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const listRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("equoria-settings");
      if (raw) setSettings((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch {
      setSettings({ themeMode: "daylight", reducedMotion: false, privacyMode: false });
    }
  }, []);

  useEffect(() => {
    apiFetch("/api/chat/session")
      .then((data) => setTurns(data.turns || []))
      .catch((error) => setLoadError(error.message));
    apiFetch("/api/journal/recent")
      .then((data) => {
        const entries = data.entries || [];
        setRecentEntries(entries);
        setSelectedEntryId(entries[0]?._id || null);
      })
      .catch((error) => setLoadError(error.message));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: settings.reducedMotion ? "auto" : "smooth", block: "end" });
  }, [turns, loading, settings.reducedMotion]);

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
    if (!quickEntry.trim()) return;
    setQuickEntryStatus("Saving...");
    try {
      const saved = await apiFetch("/api/journal/quick-entry", {
        method: "POST",
        body: JSON.stringify({ content: quickEntry, mood }),
      });
      setRecentEntries((prev) => [saved, ...prev].slice(0, 30));
      setSelectedEntryId(saved._id);
      setQuickEntry("");
      setQuickEntryStatus("Saved");
    } catch (error) {
      setQuickEntryStatus(error.message || "Save failed");
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
      ? "bg-surface-teal/20"
      : latestFocus === "positive_state"
        ? "bg-brand-500/15"
        : latestFocus === "relationships"
          ? "bg-mood-reflective/10"
          : "bg-surface-olive/35";

  return (
    <div
      className={`text-white flex flex-col theme-${settings.themeMode} ${
        !settings.reducedMotion ? "living-bg" : ""
      }`}
    >
      <main className="p-3 md:p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 h-full">
          <section className={`glass rounded-3xl flex flex-col min-h-[70vh] ${toneClass}`}>
            <div className="p-4 md:p-5 border-b border-white/10 flex items-center justify-between gap-3">
              <PageHeader eyebrow={`${heroGreeting}, ${user?.name || "there"}`} title="Reflective chat" description={smartPrompt} />
              <div className="flex items-center gap-2">
                <StatusPill>Confidence {(meta.confidence * 100).toFixed(0)}%</StatusPill>
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
                  <ToggleButton
                    key={item.id}
                    selected={chatMode === item.id}
                    onClick={() => setChatMode(item.id)}
                  >
                    {item.label}
                  </ToggleButton>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-3 items-center">
                <label className="text-xs text-white/70 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={useMemory}
                    onChange={(e) => setUseMemory(e.target.checked)}
                    className="accent-brand-300"
                  />
                  Use journal memory
                </label>
                <label className="text-xs text-white/70 flex items-center gap-2">
                  <span className="shrink-0">Response style</span>
                  <input
                    className="w-full accent-brand-300"
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
              {loadError && (
                <PageState
                  title="Chat history could not load"
                  message={loadError}
                />
              )}
              {turns.length === 0 && (
                <PageState
                  title="Start with anything"
                  message="ReflectAI will respond like a normal chat and adapt as your topic changes."
                  action={
                    <div className="flex flex-wrap gap-2">
                      {quickPrompts.slice(0, 2).map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => useQuickPrompt(prompt)}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-brand-300/20"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  }
                />
              )}

              {turns.map((turn, idx) => (
                <motion.div
                  key={`${turn.createdAt || idx}-${turn.userMessage}`}
                  initial={settings.reducedMotion ? false : { opacity: 0, y: 4 }}
                  animate={settings.reducedMotion ? undefined : { opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <div className="rounded-2xl p-3 max-w-2xl ml-auto bg-brand-300/25 soft-border">
                    <p className="text-[11px] text-brand-100 mb-1">You</p>
                    <p className="text-sm leading-6">{turn.userMessage}</p>
                  </div>
                  <AssistantMessage turn={turn} />
                </motion.div>
              ))}
              {loading && (
                <div className="glass rounded-2xl p-4 max-w-2xl">
                  <p className="text-[11px] text-brand-100 mb-2">ReflectAI</p>
                  <div className="flex items-center gap-3 text-sm text-white/70">
                    <span className="flex gap-1" aria-hidden="true">
                      <span className="h-2 w-2 rounded-full bg-brand-200 skeleton-pulse" />
                      <span className="h-2 w-2 rounded-full bg-brand-200 skeleton-pulse [animation-delay:120ms]" />
                      <span className="h-2 w-2 rounded-full bg-brand-200 skeleton-pulse [animation-delay:240ms]" />
                    </span>
                    {statusText || "Thinking..."}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="border-t border-white/10 p-4 md:p-5 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <StatusPill>Mode: {chatMode}</StatusPill>
                <StatusPill>Style: {responseStyle < 35 ? "gentle" : responseStyle < 70 ? "balanced" : "analytical"}</StatusPill>
                <StatusPill>{useMemory ? "Memory on" : "Memory off"}</StatusPill>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => useQuickPrompt(prompt)}
                    className="text-xs px-3 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-brand-300/20"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <form onSubmit={sendMessage} className="flex gap-2 items-end">
                <textarea
                  aria-label="Message ReflectAI"
                  rows={2}
                  className={`flex-1 rounded-xl bg-surface-field p-3 border border-white/10 outline-none focus:border-brand-200 resize-none min-h-11 ${
                    settings.focusMode === false ? "text-lg leading-8" : ""
                  }`}
                  placeholder="Message ReflectAI... (Enter to send, Shift+Enter for new line)"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={onComposerKeyDown}
                />
                <Button
                  disabled={loading || !message.trim()}
                >
                  Send
                </Button>
              </form>
              <p className="text-xs text-white/60">
                ReflectAI supports self-reflection and is not a medical service.
              </p>
            </div>
          </section>

          <aside className="glass rounded-3xl p-4 md:p-5 h-fit xl:sticky xl:top-6 space-y-4">
            <div>
              <p className="text-brand-100 text-xs uppercase tracking-wider">Quick Journal</p>
              <p className="text-sm text-white/70 mt-1">Capture your current state without leaving chat.</p>
            </div>
            <textarea
              aria-label="Quick journal entry"
              className="w-full rounded-xl bg-surface-field p-3 border border-white/10 min-h-28 outline-none focus:border-brand-200"
              value={quickEntry}
              onChange={(e) => setQuickEntry(e.target.value)}
              placeholder="How are you feeling today?"
            />
            <div className="grid grid-cols-2 gap-2">
              {moodOptions.map((m) => (
                <button
                  type="button"
                  key={m}
                  aria-pressed={mood === m}
                  onClick={() => setMood(m)}
                  className={`px-3 py-2 min-h-11 rounded-xl border text-sm flex items-center justify-center gap-2 ${
                    mood === m ? "bg-brand-300/30 border-brand-100" : "border-white/10"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${moodColor[m] || "bg-white/40"}`} aria-hidden="true" />
                  <span>{moodMeta[m]?.label || m}</span>
                </button>
              ))}
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={saveQuickEntry}
            >
              Save Journal Entry
            </Button>
            {quickEntryStatus && <p className="text-xs text-white/65">{quickEntryStatus}</p>}

            <div className="border-t border-white/10 pt-4 space-y-3">
              <p className="text-brand-100 text-xs uppercase tracking-wider">Emotional Timeline</p>
              <div className="flex items-end gap-1 h-8">
                {sparkline.length ? (
                  sparkline.map((entry) => (
                    <button
                      key={entry._id}
                      type="button"
                      aria-label={`Select ${entry.mood} entry from ${new Date(entry.createdAt).toDateString()}`}
                      title={`${new Date(entry.createdAt).toDateString()} • ${entry.mood}`}
                      onClick={() => setSelectedEntryId(entry._id)}
                      className={`w-3 rounded-t ${moodColor[entry.mood] || "bg-white/40"} ${
                        selectedEntryId === entry._id ? "h-8 ring-1 ring-white/80" : "h-5"
                      }`}
                    />
                  ))
                ) : (
                  <p className="text-xs text-white/60">Your mood timeline appears after your first journal entry.</p>
                )}
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
                    <p className="text-xs line-clamp-2 text-white/80">
                      {settings.privacyMode ? "Private preview hidden" : entry.content}
                    </p>
                  </button>
                ))}
              </div>
              {selectedEntry && (
                <div className="rounded-xl p-3 bg-surface-field border border-white/10">
                  <p className="text-[11px] text-brand-100">
                    {new Date(selectedEntry.createdAt).toDateString()} • {selectedEntry.mood}
                  </p>
                  <p className="text-sm text-white/85 mt-1">
                    {settings.privacyMode ? "Private preview hidden" : selectedEntry.content}
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function AssistantMessage({ turn }) {
  return (
    <Card className="max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] text-brand-100 mb-1">ReflectAI</p>
          <p className="text-sm leading-6">{turn.aiResponse}</p>
        </div>
        <StatusPill>{Math.round((turn.confidence || 0) * 100)}%</StatusPill>
      </div>
      {turn.evidence?.length > 0 && (
        <details className="mt-3 rounded-xl bg-slate-950/70 p-3 border border-white/10 text-xs">
          <summary className="cursor-pointer text-brand-100">Evidence used</summary>
          <div className="mt-3 grid gap-2">
            {turn.evidence.map((ev, i) => (
              <div key={`${ev.journalId || i}-${ev.date || ""}`} className="rounded-lg bg-white/5 p-3 border border-white/10">
                <p className="text-brand-100">
                  {ev.date ? new Date(ev.date).toDateString() : "Journal evidence"}
                </p>
                <p className="text-white/80 mt-1">{ev.quote || "Related journal reference."}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}

