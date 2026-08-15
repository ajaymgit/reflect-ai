// Counts consecutive calendar days (ending at `asOf`, inclusive) that have
// at least one journal entry. Extracted out of dashboard/routes.js so the
// journaling-reminder script (which needs "streak as of yesterday" -- the
// streak someone is about to break if they don't journal today) can share
// the exact same day-counting logic as the dashboard's live streak display
// (which needs "streak as of today"), instead of two subtly different
// implementations drifting apart over time.
export function getStreakDays(journals = [], { asOf } = {}) {
  if (!journals.length) return 0;
  const uniqueDays = new Set(
    journals.map((entry) => {
      const date = new Date(entry.createdAt);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }),
  );

  let streak = 0;
  const cursor = asOf ? new Date(asOf) : new Date();
  cursor.setHours(0, 0, 0, 0);

  while (true) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (!uniqueDays.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
