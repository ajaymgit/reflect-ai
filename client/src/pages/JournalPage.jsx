import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { Button, Card, PageHeader, TextField } from "../ui";

const moods = ["happy", "calm", "reflective", "sad", "stressed", "angry"];
const prompts = [
  "What gave you energy today?",
  "What felt heavier than expected?",
  "What are you learning about your pace?",
  "What would future-you want remembered from today?",
];

export default function JournalPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("reflective");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState("Idle");
  const [promptIndex, setPromptIndex] = useState(0);
  const [entries, setEntries] = useState([]);
  const [activeEntryId, setActiveEntryId] = useState(null);
  const [activeEntryPreview, setActiveEntryPreview] = useState("");
  const [loadingEntries, setLoadingEntries] = useState(false);

  const moodClass = useMemo(() => `mood-${mood}`, [mood]);
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 180));
  const canEdit = Boolean(activeEntryId);
  const sections = [
    { id: "journal-writing", label: "Writing" },
    { id: "journal-help", label: "Help" },
    { id: "journal-history", label: "Past entries" },
    { id: "journal-selected", label: "Selected entry" },
  ];
  function jumpTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    async function loadEntries() {
      setLoadingEntries(true);
      try {
        const data = await apiFetch("/api/journal/recent");
        setEntries(data.entries || []);
      } finally {
        setLoadingEntries(false);
      }
    }
    loadEntries();
  }, []);

  async function save() {
    if (!content.trim()) return;
    setStatus("Saving...");
    try {
      const finalContent = `${title ? `${title}\n` : ""}${content}${tags ? `\n#${tags}` : ""}`;
      if (activeEntryId) {
        const updated = await apiFetch(`/api/journal/${activeEntryId}`, {
          method: "PUT",
          body: JSON.stringify({
            content: finalContent,
            mood,
          }),
        });
        setEntries((prev) =>
          prev.map((entry) => (entry._id === updated._id ? { ...entry, ...updated } : entry)),
        );
      } else {
        const created = await apiFetch("/api/journal/quick-entry", {
          method: "POST",
          body: JSON.stringify({
            content: finalContent,
            mood,
          }),
        });
        setEntries((prev) => [created, ...prev].slice(0, 30));
      }
      setStatus("Saved");
    } catch {
      setStatus("Save failed");
    }
  }

  async function openEntry(entryId) {
    setStatus("Loading...");
    try {
      const entry = await apiFetch(`/api/journal/${entryId}`);
      const raw = String(entry.content || "");
      const lines = raw.split("\n");
      const maybeTitle = lines[0]?.trim() || "";
      const hasTagLine = lines[lines.length - 1]?.startsWith("#");
      const bodyLines = lines.slice(1, hasTagLine ? -1 : undefined);
      setTitle(maybeTitle && lines.length > 1 ? maybeTitle : "");
      setContent(lines.length > 1 ? bodyLines.join("\n").trim() : raw.trim());
      setTags(hasTagLine ? lines[lines.length - 1].slice(1) : "");
      setMood(entry.mood || "reflective");
      setActiveEntryId(entry._id);
      setActiveEntryPreview(raw);
      setStatus("Loaded");
    } catch {
      setStatus("Load failed");
    }
  }

  function newEntry() {
    setActiveEntryId(null);
    setTitle("");
    setContent("");
    setTags("");
    setMood("reflective");
    setActiveEntryPreview("");
    setStatus("Idle");
  }

  function applyPrompt() {
    const prompt = prompts[promptIndex];
    setContent((prev) => `${prev}${prev.trim() ? "\n\n" : ""}${prompt}\n`);
    setPromptIndex((prev) => (prev + 1) % prompts.length);
  }

  return (
    <main className={`p-4 md:p-6 ${moodClass}`}>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="glass rounded-2xl p-3">
          <p className="text-[11px] uppercase tracking-wider text-white/65">Jump to section</p>
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
          </div>
        </div>
        <PageHeader
          eyebrow="New journal entry"
          title="Turn today into a memory"
          description="Write what happened, choose how you felt, then continue in chat when you are ready."
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={newEntry}
                className="inline-flex rounded-xl px-4 py-2.5 bg-white/10 border border-white/15 hover:bg-white/15 text-sm"
              >
                New entry
              </button>
              <Link to="/chat" className="inline-flex rounded-xl px-4 py-2.5 bg-white/10 border border-white/15 hover:bg-white/15 text-sm">
                Continue in chat
              </Link>
            </div>
          }
        />
        <div className="grid xl:grid-cols-[1fr_320px] gap-4">
          <section id="journal-writing" className="glass rounded-2xl p-4 md:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-brand-100 text-xs uppercase tracking-wider">Writing canvas</p>
            <p className="text-xs text-white/55">{wordCount} words · {readingTime} min read</p>
          </div>
          <TextField
            id="journal-title"
            label="Entry title"
            placeholder="A short title for this moment"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextField
            id="journal-content"
            label="Journal text"
            as="textarea"
            className="min-h-72 leading-7"
            placeholder="Write freely..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <TextField
              id="journal-tags"
              label="Tags"
              placeholder="tags (comma separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <Button type="button" className="self-end" onClick={save}>
              {canEdit ? "Update entry" : "Save entry"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-white/60" role="status">Save status: {status}</p>
            <Button type="button" variant="ghost" className="min-h-9 px-3 py-1.5" onClick={applyPrompt}>
              Add prompt
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {moods.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mood === m}
                onClick={() => setMood(m)}
                className={`px-3 py-2 rounded-xl border text-sm ${
                  mood === m ? "bg-brand-300/25 border-brand-100/50" : "bg-white/5 border-white/10"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </section>

        <aside id="journal-help" className="glass rounded-2xl p-4 space-y-3 h-fit">
          <h3 className="font-medium">Help while writing</h3>
          <Card title="Current prompt">
            <p className="text-sm text-white/80">{prompts[promptIndex]}</p>
          </Card>
          <Card title="Easy structure">
            <p className="text-sm text-white/80">Try three lines: what happened, what you felt, and what you need next.</p>
          </Card>
          <Card title="Next step">
            <p className="text-sm text-white/80">After saving, open chat and ask ReflectAI to help unpack the pattern.</p>
          </Card>
          <Card id="journal-history" title="Past entries">
            {loadingEntries ? <p className="text-sm text-white/60">Loading your journal history...</p> : null}
            {!loadingEntries && entries.length === 0 ? (
              <p className="text-sm text-white/60">No saved entries yet.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto scroll-area space-y-2">
                {entries.map((entry) => (
                  <button
                    key={entry._id}
                    type="button"
                    onClick={() => openEntry(entry._id)}
                    className={`w-full text-left rounded-xl p-2 border ${
                      activeEntryId === entry._id
                        ? "bg-white/10 border-white/30"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <p className="text-[11px] text-white/60">
                      {new Date(entry.createdAt).toDateString()} · {entry.mood}
                    </p>
                    <p className="text-xs text-white/80 line-clamp-2">{entry.content}</p>
                  </button>
                ))}
              </div>
            )}
          </Card>
          {activeEntryId ? (
            <Card id="journal-selected" title="Full selected entry">
              <div className="max-h-64 overflow-y-auto scroll-area rounded-xl bg-white/5 border border-white/10 p-3">
                <p className="text-sm text-white/85 whitespace-pre-line">{activeEntryPreview}</p>
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
      </div>
    </main>
  );
}
