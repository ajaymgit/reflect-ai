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

// Tailwind arbitrary-value classes derived from MOOD_HEX, for spots that
// want a class string rather than an inline style (dots, pills, bars).
export const MOOD_BG_CLASS = Object.fromEntries(
  Object.entries(MOOD_HEX).map(([mood, hex]) => [mood, `bg-[${hex}]`])
);

export const MOOD_META = MOODS.map((key) => ({
  key,
  label: MOOD_LABELS[key],
  color: MOOD_BG_CLASS[key],
  hex: MOOD_HEX[key],
}));
