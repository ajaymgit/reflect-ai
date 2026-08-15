// Local, keyword-based mood suggestion -- entirely client-side (no network
// call per keystroke), the same simple lexicon-matching approach real AI
// journaling tools describe using for their lighter-weight mood detection.
// Deliberately a SUGGESTION the person can accept or ignore, never an
// auto-applied mood -- the whole point of picking a mood is that it's a real,
// honest self-report, not something the app decides for you.
//
// Originally lived only in JournalPage.jsx; extracted here so ChatPage's
// quick-journal composer can offer the same suggestion instead of shipping a
// second, drifting copy of the same keyword list.
export const MOOD_KEYWORDS = {
  happy: ["happy", "great", "excited", "joy", "joyful", "amazing", "wonderful", "grateful", "thankful", "proud", "love", "loved", "fun", "laughed", "celebrate", "delighted"],
  calm: ["calm", "peaceful", "relaxed", "content", "steady", "quiet", "rested", "grounded", "ease", "serene", "settled"],
  reflective: ["thinking", "wonder", "wondering", "realize", "realized", "reflect", "reflecting", "meaning", "perspective", "learned", "lesson", "curious", "noticing"],
  sad: ["sad", "down", "lonely", "hurt", "cry", "crying", "miss", "missing", "empty", "heavy", "grief", "loss", "disappointed", "numb"],
  stressed: ["stressed", "overwhelmed", "anxious", "anxiety", "worried", "worry", "pressure", "deadline", "exhausted", "tired", "rushed", "panicking"],
  angry: ["angry", "mad", "furious", "frustrated", "annoyed", "irritated", "rage", "hate", "unfair", "resent", "resentful"],
};

export function suggestMoodFromText(text) {
  const words = (text || "").toLowerCase().match(/[a-z']+/g) || [];
  if (words.length < 8) return null; // too little text to read anything into
  const scores = {};
  for (const word of words) {
    for (const [m, list] of Object.entries(MOOD_KEYWORDS)) {
      if (list.includes(word)) scores[m] = (scores[m] || 0) + 1;
    }
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked[0][1] < 2) return null; // need at least 2 hits, not one stray word
  return ranked[0][0];
}
