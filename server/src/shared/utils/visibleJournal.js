// Time capsules (JournalEntry.revealAt) are letters to a future version of
// yourself: excluded from EVERY normal read of a user's journal entries
// until their reveal date arrives -- not just the obvious listing pages,
// but anywhere journal content or mood feeds into something the user (or
// an AI acting on their behalf) can see: health/mood correlations,
// Retrospect's analysis (both the deterministic stats route and the AI
// generation prompt), Year in Review's aggregate stats, the full data
// export, and the chat AI's evidence retrieval (which can literally quote
// a journal entry back in a response). The explicit product promise (see
// journal/routes.js's own /capsules route) is that "even the sender can't
// peek early" -- that only holds if every single query reading this user's
// entries applies this same guard, not just the ones that render an
// obvious "browse my entries" list.
//
// `$not: { $gt: now }` matches both a normal entry (revealAt null/
// undefined) and a capsule whose reveal date has already passed; only a
// revealAt strictly in the future is excluded.
//
// This was previously duplicated ad hoc as a local `visibleFilter` inside
// journal/routes.js and dashboard/routes.js -- and, as duplicated
// conventions do, silently failed to make it into every other file that
// went on to query JournalEntry directly. Centralizing it here means new
// code importing this (rather than writing its own `{ userId }` query from
// scratch) gets the guard automatically, instead of relying on everyone
// remembering to copy it correctly.
export function visibleJournalFilter(extra = {}) {
  return { ...extra, revealAt: { $not: { $gt: new Date() } } };
}
