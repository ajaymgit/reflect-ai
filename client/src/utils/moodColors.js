// Single source of truth for mood colors. Previously this same six-color map
// was copy-pasted independently in 10+ files (Dashboard, Journal, Chat,
// Retrospect, Health, MoodCalendar, MoodRoseChart, MoodGlobeLauncher,
// EntryModal, JournalHistoryPage, YearInReview) with "angry" set to a raw
// saturated Tailwind red (#ef4444) in every copy -- a jarring, "error state"
// red sitting next to five muted/desaturated earth tones (amber, sage,
// mauve, violet, terracotta). Replaced with a muted brick-red that reads as
// "angry" while staying in the same desaturated family as the rest of the
// palette. One change here now fixes every mood dot/pill/bar/chart in the
// app instead of six-to-ten separate edits.
export const MOOD_HEX = {
  happy: "#e8ab5f",
  calm: "#8eb184",
  reflective: "#a989b2",
  sad: "#84689d",
  stressed: "#da8b5b",
  angry: "#c2574a",
};

export const MOOD_LABELS = {
  happy: "Happy",
  calm: "Calm",
  reflective: "Reflective",
  sad: "Sad",
  stressed: "Stressed",
  angry: "Angry",
};

export const MOODS = Object.keys(MOOD_HEX);

// NOTE: this used to export MOOD_BG_CLASS -- Tailwind arbitrary-value class
// strings (`bg-[#e8ab5f]`) built via template literal at runtime. Tailwind's
// JIT scanner only generates CSS for class names it can find as literal text
// in source files; a class name assembled at runtime from a JS object is
// invisible to it. The result: every mood dot/pill/bar built from that map
// (Journal, History, Chat, YearInReview, EntryModal, MoodCalendar) was
// silently rendering with NO background color at all. Replaced with a style
// helper -- inline styles always work regardless of what Tailwind can scan.
export function moodDotStyle(mood, opacity = 1) {
  const hex = MOOD_HEX[mood];
  if (!hex) return { backgroundColor: "rgba(255,255,255,0.35)" };
  if (opacity >= 1) return { backgroundColor: hex };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { backgroundColor: `rgba(${r}, ${g}, ${b}, ${opacity})` };
}

export const MOOD_META = MOODS.map((key) => ({
  key,
  label: MOOD_LABELS[key],
  hex: MOOD_HEX[key],
}));
