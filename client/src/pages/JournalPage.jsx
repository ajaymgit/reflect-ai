import { useMemo, useState } from "react";
import { apiFetch } from "../api";
import { Button, TextField } from "../ui";

const moods = ["happy", "calm", "reflective", "sad", "stressed", "angry"];

export default function JournalPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("reflective");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState("Idle");

  const moodClass = useMemo(() => `mood-${mood}`, [mood]);

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

  return (
    <main className={`p-4 md:p-6 ${moodClass}`}>
      <div className="max-w-6xl mx-auto grid xl:grid-cols-[1fr_320px] gap-4">
        <section className="glass rounded-2xl p-4 md:p-5 space-y-3">
          <p className="text-brand-100 text-xs uppercase tracking-wider">New journal entry</p>
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
            className="min-h-72"
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
            <Button className="self-end" onClick={save}>
              Save entry
            </Button>
          </div>
          <p className="text-xs text-white/60" role="status">Save status: {status}</p>
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
          <Card title="Gentle prompt" body="What changed in your energy between morning and evening today?" />
          <Card title="Structure idea" body="Try three lines: what happened, what you felt, and what you need next." />
          <Card title="Privacy note" body="Only saved entries become part of your reflection memory." />
        </aside>
      </div>
    </main>
  );
}

function Card({ title, body }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <p className="text-xs text-brand-100">{title}</p>
      <p className="text-sm text-white/80 mt-1">{body}</p>
    </div>
  );
}
