// Local-timezone "YYYY-MM-DD" key, matching the day-bucketing convention the
// server already uses in a few places (dashboard/routes.js's getStreakDays,
// the mood-calendar and journal/by-date endpoints) -- centralized here so
// every client-side place that needs to turn a Date into the same kind of
// day key doesn't reimplement it slightly differently.
export function isoDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
