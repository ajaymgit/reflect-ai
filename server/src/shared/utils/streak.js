// Buckets a UTC timestamp into a "Y-M-D" calendar-day key for a given
// timezone, expressed the same way JS's own Date.prototype.getTimezoneOffset
// does: minutes to ADD to local time to reach UTC (e.g. +480 for PST,
// -60 for CET). Shifting the raw UTC timestamp by that offset and then
// reading UTC components (not local ones) gives the calendar date as that
// timezone would see it, regardless of what timezone the Node process
// itself happens to be running in -- so this works the same whether the
// server is deployed with TZ=UTC, TZ=America/Los_Angeles, or unset.
export function localDayKey(date, tzOffsetMinutes = 0) {
  const shifted = new Date(date.getTime() - tzOffsetMinutes * 60000);
  return `${shifted.getUTCFullYear()}-${shifted.getUTCMonth()}-${shifted.getUTCDate()}`;
}

// Counts consecutive calendar days (ending at `asOf`, inclusive) that have
// at least one journal entry. Extracted out of dashboard/routes.js so the
// journaling-reminder script (which needs "streak as of yesterday" -- the
// streak someone is about to break if they don't journal today) can share
// the exact same day-counting logic as the dashboard's live streak display
// (which needs "streak as of today"), instead of two subtly different
// implementations drifting apart over time.
//
// tzOffsetMinutes (Date.prototype.getTimezoneOffset() convention, e.g. +480
// for PST) lets a caller bucket days the way a specific person's calendar
// sees them. Previously this used getFullYear()/getMonth()/getDate(), which
// read the SERVER process's local timezone -- someone in PST journaling at
// 11pm (7am UTC the next day) could have that entry silently bucketed into
// "tomorrow" by a UTC-deployed server, breaking their streak count near
// midnight even though, from their own calendar, they journaled every day.
// Defaults to 0 (UTC) so existing callers that don't have a per-request
// timezone (the reminder cron script) keep their previous behavior exactly.
export function getStreakDays(journals = [], { asOf, tzOffsetMinutes = 0 } = {}) {
  if (!journals.length) return 0;
  const uniqueDays = new Set(journals.map((entry) => localDayKey(new Date(entry.createdAt), tzOffsetMinutes)));

  let streak = 0;
  const cursor = asOf ? new Date(asOf) : new Date();

  while (true) {
    const key = localDayKey(cursor, tzOffsetMinutes);
    if (!uniqueDays.has(key)) break;
    streak += 1;
    // Pure millisecond subtraction (not cursor.setDate) so this keeps
    // walking calendar days in the *target* timezone's frame, not whatever
    // timezone the server's Date object considers "local".
    cursor.setTime(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return streak;
}
