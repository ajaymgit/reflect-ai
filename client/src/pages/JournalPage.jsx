import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

const moods = ["happy", "calm", "reflective", "sad", "stressed", "angry"];

export default function JournalPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("reflective");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState("Idle");
  const [experiments, setExperiments] = useState(null);

  const moodClass = useMemo(() => `mood-${mood}`, [mood]);

  useEffect(() => {
    apiFetch("/api/hypotheses/summary")
      .then(setExperiments)
      .catch(() => {});
  }, []);

  async function save() {
    if (!content.trim()) return;
    setStatus("Saving...");
    try {
      const saved = await apiFetch("/api/journal/quick-entry", {
        method: "POST",
        body: JSON.stringify({
          content: `${title ? `${title}\n` : ""}${content}\n${tags ? `#${tags}` : ""}`,
          mood,
        }),
      });
      if (saved?.hypothesisSummary) {
        setExperiments(saved.hypothesisSummary);
      }
      setStatus("Saved");
    } catch {
      setStatus("Save failed");
    }
  }

  return (
    <main className={`p-4 md:p-6 ${moodClass}`}>
      <div className="max-w-6xl mx-auto grid xl:grid-cols-[1fr_320px] gap-4">
        <section className="glass rounded-2xl p-4 md:p-5 space-y-3">
          <p className="text-cyan-300 text-xs uppercase tracking-wider">New journal entry</p>
          <input
            className="w-full rounded-xl bg-[#111827] p-3 border border-white/10"
            placeholder="Entry title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full rounded-xl bg-[#111827] p-3 border border-white/10 min-h-72"
            placeholder="Write freely..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <input
              className="rounded-xl bg-[#111827] p-3 border border-white/10"
              placeholder="tags (comma separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <button className="rounded-xl px-5 bg-violet-500 hover:bg-violet-400 min-h-11" onClick={save}>
              Save entry
            </button>
          </div>
          <p className="text-xs text-white/60">Autosave status: {status}</p>
          <div className="flex flex-wrap gap-2">
            {moods.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMood(m)}
                className={`px-3 py-2 rounded-xl border text-sm ${
                  mood === m ? "bg-cyan-500/25 border-cyan-300/40" : "bg-white/5 border-white/10"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </section>

        <aside className="glass rounded-2xl p-4 space-y-3 h-fit">
          <h3 className="font-medium">Writing support</h3>
          <Card
            title="Experiment-validated patterns"
            body={
              experiments?.total
                ? `${experiments.supported} supported · ${experiments.testing} testing · ${experiments.contradicted} contradicted`
                : "Write a few entries to generate personal reflection experiments."
            }
          />
          {(experiments?.hypotheses || []).slice(0, 2).map((hypothesis) => (
            <Card
              key={hypothesis.id}
              title={`${hypothesis.status} · ${(hypothesis.confidence * 100).toFixed(0)}%`}
              body={hypothesis.hypothesisText}
            />
          ))}
          <Card title="Today's health stats" body="Sleep: 7.6h · Steps: 6,200 · Stress: 52" />
          <Card title="AI writing prompt" body="What changed in your energy between morning and evening today?" />
          <Card title="Related previous entry" body="You wrote about focus and boundaries three days ago." />
        </aside>
      </div>
    </main>
  );
}

function Card({ title, body }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <p className="text-xs text-cyan-300">{title}</p>
      <p className="text-sm text-white/80 mt-1">{body}</p>
    </div>
  );
}
