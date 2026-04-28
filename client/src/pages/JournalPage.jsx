import { useMemo, useState } from "react";
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

  const moodClass = useMemo(() => `mood-${mood}`, [mood]);
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 180));

  async function save() {
    if (!content.trim()) return;
    setStatus("Saving...");
    try {
      await apiFetch("/api/journal/quick-entry", {
        method: "POST",
        body: JSON.stringify({
          content: `${title ? `${title}\n` : ""}${content}\n${tags ? `#${tags}` : ""}`,
          mood,
        }),
      });
      setStatus("Saved");
    } catch {
      setStatus("Save failed");
    }
  }

  function applyPrompt() {
    const prompt = prompts[promptIndex];
    setContent((prev) => `${prev}${prev.trim() ? "\n\n" : ""}${prompt}\n`);
    setPromptIndex((prev) => (prev + 1) % prompts.length);
  }

  return (
    <main className={`p-4 md:p-6 ${moodClass}`}>
      <div className="max-w-6xl mx-auto space-y-4">
        <PageHeader
          eyebrow="New journal entry"
          title="Turn today into a memory"
          description="Capture the moment, choose the mood, then continue into reflection when you are ready."
          action={
            <Link to="/chat" className="inline-flex rounded-xl px-4 py-2.5 bg-white/10 border border-white/15 hover:bg-white/15 text-sm">
              Continue in chat
            </Link>
          }
        />
        <div className="grid xl:grid-cols-[1fr_320px] gap-4">
          <section className="glass rounded-2xl p-4 md:p-5 space-y-3">
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
              Save entry
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

        <aside className="glass rounded-2xl p-4 space-y-3 h-fit">
          <h3 className="font-medium">Writing support</h3>
          <Card title="Current prompt">
            <p className="text-sm text-white/80">{prompts[promptIndex]}</p>
          </Card>
          <Card title="Structure idea">
            <p className="text-sm text-white/80">Try three lines: what happened, what you felt, and what you need next.</p>
          </Card>
          <Card title="Next step">
            <p className="text-sm text-white/80">After saving, open chat and ask ReflectAI to help unpack the pattern.</p>
          </Card>
        </aside>
      </div>
      </div>
    </main>
  );
}
