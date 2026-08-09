import { useEffect, useMemo, useState } from "react";
import { apiFetch, describeError } from "../api";

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

const moods = ["happy", "calm", "reflective", "sad", "stressed", "angry"];
// Same per-mood colors used on Dashboard/Chat, so the selected mood button
// actually reflects that mood's color everywhere in the app instead of a
// single generic "selected" color regardless of which mood was picked.
const moodColors = {
  happy: "bg-[#e8ab5f]/25 border-[#e8ab5f]/50",
  calm: "bg-[#8eb184]/25 border-[#8eb184]/50",
  reflective: "bg-[#a989b2]/25 border-[#a989b2]/50",
  sad: "bg-[#84689d]/25 border-[#84689d]/50",
  stressed: "bg-[#da8b5b]/25 border-[#da8b5b]/50",
  angry: "bg-[#ef4444]/25 border-[#ef4444]/50",
};
// Previously only the *selected* button got any color at all (a faint 25%
// tint) -- every other mood sat there as a plain grey pill with no color
// hint, so this picker looked disconnected from the color language used
// everywhere else in the app (calendar, emotion pills, chat). A solid dot
// now marks every option regardless of selection state, same as ChatPage's
// mood picker.
const moodDotColors = {
  happy: "bg-[#e8ab5f]",
  calm: "bg-[#8eb184]",
  reflective: "bg-[#a989b2]",
  sad: "bg-[#84689d]",
  stressed: "bg-[#da8b5b]",
  angry: "bg-[#ef4444]",
};

export default function JournalPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("reflective");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState("");
  const [health, setHealth] = useState(null);
  const [relatedEntry, setRelatedEntry] = useState(null);

  const moodClass = useMemo(() => `mood-${mood}`, [mood]);

  useEffect(() => {
    apiFetch("/api/health-data/overview")
      .then((data) => setHealth(data?.latest || null))
      .catch(() => {});
    apiFetch("/api/journal/recent")
      .then((data) => setRelatedEntry((data?.entries || [])[0] || null))
      .catch(() => {});
  }, []);

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
      await apiFetch("/api/journal/quick-entry", {
        method: "POST",
        body: JSON.stringify({
          content,
          mood,
          title: title.trim() || undefined,
          tags: parsedTags.length ? parsedTags : undefined,
        }),
      });
      // Previously the form kept the saved text in place with only a small
      // status label changing to "Saved" -- easy to miss, and easy to
      // accidentally hit Save again and create a duplicate entry. Now the
      // form actually clears once the save is confirmed.
      setTitle("");
      setContent("");
      setTags("");
      setStatus("Saved");
    } catch (err) {
      // Previously this discarded the real error entirely and always showed
      // the same generic "Save failed", regardless of the actual cause.
      setStatus(describeError(err));
    }
  }

  return (
    <main className={`ui-page living-bg ${moodClass}`}>
      <div className="max-w-6xl mx-auto grid xl:grid-cols-[1fr_320px] gap-4">
        <section className="ui-card rounded-2xl p-4 md:p-5 space-y-3">
          <p className="ui-kicker">New journal entry</p>
          <input
            className="ui-input"
            placeholder="Entry title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="ui-input min-h-72"
            placeholder="Write freely..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
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
          <h3 className="font-medium">Writing support</h3>
          <Card
            title="Today's health stats"
            body={
              health
                ? `Sleep: ${health.sleepHours ?? "--"}h · Steps: ${health.steps ?? "--"} · Stress: ${health.stressScore ?? "--"}`
                : "No health data logged yet."
            }
          />
          <Card title="Writing prompt" body="What changed in your energy between morning and evening today?" />
          <Card
            title="Related previous entry"
            body={
              relatedEntry
                ? `${new Date(relatedEntry.createdAt).toDateString()}: ${relatedEntry.title || truncateAtWord(relatedEntry.content, 60) || "Untitled entry"}`
                : "No previous entries yet."
            }
          />
        </aside>
      </div>
    </main>
  );
}

function Card({ title, body }) {
  return (
    <div className="surface p-3">
      <p className="ui-kicker">{title}</p>
      <p className="text-sm text-white/80 mt-1">{body}</p>
    </div>
  );
}
