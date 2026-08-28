// Shared, localStorage-backed "has this ready time capsule already been
// opened from a notification/badge" tracker. There's no server-side
// read/acknowledged flag on JournalEntry (see server/src/models/JournalEntry.js
// -- revealAt only ever means "past" or "future," nothing in between), so a
// capsule that's arrived stays "arrived" forever from the API's point of
// view. Both Dashboard's ready-capsule banner and AppShell's nav badge need
// to agree on which arrived capsules the person has already acted on, or
// opening one from Dashboard wouldn't clear the badge in the nav (and vice
// versa) -- previously this lived only in DashboardPage.jsx as a local
// module-level helper; extracted here once a second consumer needed the
// exact same key, since two independently-duplicated copies of a *mutable*
// storage key is a real correctness risk (a typo'd key name in one copy
// silently breaks the sync), unlike duplicating a small pure constant.
const CAPSULE_SEEN_KEY = "equoria-capsules-opened";

export function getSeenCapsuleIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CAPSULE_SEEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function markCapsuleSeen(id) {
  try {
    const seen = getSeenCapsuleIds();
    seen.add(id);
    localStorage.setItem(CAPSULE_SEEN_KEY, JSON.stringify(Array.from(seen)));
  } catch {
    // localStorage unavailable -- badges/banners will just reappear next load.
  }
}
