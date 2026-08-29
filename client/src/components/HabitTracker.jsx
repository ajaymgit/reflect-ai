import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Book,
  Brain,
  Check,
  Coffee,
  Dumbbell,
  Droplet,
  Flame,
  Heart,
  Moon,
  Music2,
  Pencil,
  Plus,
  Sun,
  Target,
  Trash2,
  Wind,
  X,
} from "lucide-react";
import { apiFetch, describeError } from "../api";
import { MOOD_HEX } from "../utils/moodColors";

// Shared by HealthPage (full) and DashboardPage (compact) so both read from
// one implementation of "what a habit row looks like" instead of two
// hand-copied versions drifting apart -- same reasoning as this app's other
// cross-page shared components (DayEntryPreview, MoodCalendar).
//
// Backed by /api/habits -- GET returns each habit with today's completion,
// current/longest streak (server-computed, see habits/routes.js's
// computeStreaks), a 7-day dot history, and a 35-day heatmap. Toggling a day
// creates/deletes a HabitLog row server-side; this component optimistically
// flips the tapped day, then reconciles streak numbers with whatever the
// server actually computed, so a race between two tabs or a failed request
// never leaves the UI showing a streak that doesn't match the database.

// One curated icon per common habit shape, not a full icon-picker library --
// matches this codebase's existing icon-library convention (lucide-react
// only, one family per project).
const ICONS = {
  target: Target,
  dumbbell: Dumbbell,
  book: Book,
  droplet: Droplet,
  moon: Moon,
  sun: Sun,
  heart: Heart,
  brain: Brain,
  coffee: Coffee,
  music: Music2,
  wind: Wind,
};
const ICON_KEYS = Object.keys(ICONS);

// Cobalt/coral are the app's own two brand accents (see tailwind.config's
// --signal/--ember); the rest reuse MOOD_HEX so a habit's color sits in the
// same palette family as everything else in the app instead of introducing
// new hues. Hex, not Tailwind classes -- moodColors.js's own comment already
// documents why a runtime-assembled `bg-[${hex}]` class is invisible to
// Tailwind's JIT scanner; inline styles always work.
const HABIT_COLORS = {
  signal: "#3D4FD1",
  ember: "#E1502C",
  calm: MOOD_HEX.calm,
  happy: MOOD_HEX.happy,
  reflective: MOOD_HEX.reflective,
  angry: MOOD_HEX.angry,
};
const COLOR_KEYS = Object.keys(HABIT_COLORS);

function colorHex(key) {
  return HABIT_COLORS[key] || HABIT_COLORS.signal;
}
function IconFor({ iconKey, ...props }) {
  const Cmp = ICONS[iconKey] || Target;
  return <Cmp {...props} />;
}

function isoDayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const todayKey = isoDayKey(new Date());

// Groups a flat 35-day array (oldest first, see habits/routes.js's
// lastNDays) into 5 Monday-start weeks for a GitHub-contributions-style
// grid. The very first partial week is left-padded with nulls so every
// week column has exactly 7 cells and real dates land under the correct
// weekday letter regardless of which weekday the 35-day window happens to
// start on.
function toWeekGrid(days) {
  if (!days?.length) return [];
  const first = new Date(days[0].date);
  const firstWeekday = first.getDay(); // 0 = Sunday
  const leadingBlank = firstWeekday === 0 ? 6 : firstWeekday - 1; // Monday-start
  const padded = [...Array.from({ length: leadingBlank }).map(() => null), ...days];
  const weeks = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
  return weeks;
}

export default function HabitTracker({ compact = false }) {
  const [habits, setHabits] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("target");
  const [newColor, setNewColor] = useState("signal");
  const [showNewOptions, setShowNewOptions] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [archived, setArchived] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = () => {
    setLoadError(false);
    return apiFetch("/api/habits")
      .then((res) => setHabits(res.habits || []))
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    load();
  }, []);

  function loadArchived() {
    apiFetch("/api/habits?archived=true")
      .then((res) => setArchived(res.habits || []))
      .catch(() => setArchived([]));
  }

  async function addHabit(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      const created = await apiFetch("/api/habits", {
        method: "POST",
        body: JSON.stringify({ name, icon: newIcon, color: newColor }),
      });
      setHabits((prev) => [...(prev || []), created]);
      setNewName("");
      setNewIcon("target");
      setNewColor("signal");
      setShowNewOptions(false);
    } catch {
      // Silently ignored beyond leaving the input filled -- a failed add is
      // rare (auth/network) and immediately visible as "nothing happened,"
      // no separate error banner needed for something this low-stakes.
    } finally {
      setAdding(false);
    }
  }

  function flipDay(list, habitId, date) {
    return list.map((h) => {
      if (h.id !== habitId) return h;
      const key = isoDayKey(date);
      return {
        ...h,
        last7Days: h.last7Days.map((d) => (isoDayKey(d.date) === key ? { ...d, completed: !d.completed } : d)),
        heatmap: (h.heatmap || []).map((d) => (d && isoDayKey(d.date) === key ? { ...d, completed: !d.completed } : d)),
        todayCompleted: key === todayKey ? !h.todayCompleted : h.todayCompleted,
      };
    });
  }

  async function toggleDay(habitId, date) {
    // Optimistic flip of just this one day's dot -- the streak numbers
    // themselves wait for the server's real recount rather than being
    // guessed client-side, since "is this still a streak" depends on the
    // full history, not just the one day that changed.
    setHabits((prev) => flipDay(prev, habitId, date));
    try {
      const result = await apiFetch(`/api/habits/${habitId}/toggle`, {
        method: "POST",
        body: JSON.stringify({ date: isoDayKey(date) }),
      });
      setHabits((prev) =>
        prev.map((h) =>
          h.id === habitId
            ? {
                ...h,
                currentStreak: result.currentStreak,
                longestStreak: result.longestStreak,
                completedThisWeek: result.completedThisWeek,
                todayCompleted: result.todayCompleted,
              }
            : h,
        ),
      );
    } catch {
      // Revert the optimistic flip on failure by just reloading -- simpler
      // and more trustworthy than trying to hand-reconstruct the pre-toggle
      // state here.
      load();
    }
  }

  async function saveEdit(habitId, patch) {
    const updated = await apiFetch(`/api/habits/${habitId}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (patch.archived) {
      setHabits((prev) => prev.filter((h) => h.id !== habitId));
    } else {
      setHabits((prev) => prev.map((h) => (h.id === habitId ? updated : h)));
    }
    setEditingId(null);
  }

  async function restoreHabit(habitId) {
    await apiFetch(`/api/habits/${habitId}`, { method: "PATCH", body: JSON.stringify({ archived: false }) });
    setArchived((prev) => (prev || []).filter((h) => h.id !== habitId));
    load();
  }

  async function deleteHabit(habitId) {
    setConfirmDeleteId(null);
    setHabits((prev) => prev.filter((h) => h.id !== habitId));
    try {
      await apiFetch(`/api/habits/${habitId}`, { method: "DELETE" });
    } catch {
      load();
    }
  }

  if (!habits && !loadError) {
    return (
      <div className={compact ? "space-y-2" : "space-y-3"}>
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-ink/60">Couldn't load habits.</p>
        <button type="button" onClick={load} className="text-xs text-signal hover:text-signal-soft font-medium">
          Try again
        </button>
      </div>
    );
  }

  const visibleHabits = compact ? habits.slice(0, 4) : habits;

  return (
    <div className="space-y-1">
      {visibleHabits.length === 0 && (
        <p className="text-sm text-ink/50 mb-2">
          {compact ? "No habits yet -- add one on the Health page." : "Nothing here yet -- add something you're building or breaking below."}
        </p>
      )}

      {visibleHabits.map((habit) => {
        const hex = colorHex(habit.color);
        const isEditing = editingId === habit.id;
        return (
          <div key={habit.id} className={`py-2 ${!compact ? "border-b border-ink/[0.06] last:border-b-0" : ""}`}>
            <div className="flex items-center gap-3">
              {/* Toggle -- a satisfying scale-pop + checkmark swap on
                  completion, the same kind of tactile feedback Streaks/Way
                  of Life use for their tap targets, instead of a flat color
                  swap with no motion at all. */}
              <motion.button
                type="button"
                onClick={() => toggleDay(habit.id, new Date())}
                aria-pressed={habit.todayCompleted}
                title={habit.todayCompleted ? "Mark today not done" : "Mark today done"}
                whileTap={{ scale: 0.85 }}
                className="shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center"
                style={{
                  backgroundColor: habit.todayCompleted ? hex : "transparent",
                  borderColor: habit.todayCompleted ? hex : "rgb(var(--ink) / 0.25)",
                }}
              >
                <AnimatePresence>
                  {habit.todayCompleted && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    >
                      <Check size={14} className="text-white" strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>

              {!compact && (
                <span
                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${hex}1f`, color: hex }}
                >
                  <IconFor iconKey={habit.icon} size={14} />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className={`text-sm truncate ${habit.todayCompleted ? "text-ink/60 line-through decoration-ink/30" : "text-ink/90"}`}>
                  {habit.name}
                </p>
                {!compact && (
                  <p className="text-[11px] text-ink/45 mt-0.5">
                    {habit.completedThisWeek}/{habit.targetPerWeek} this week
                    {habit.longestStreak > habit.currentStreak ? ` · best ${habit.longestStreak}` : ""}
                  </p>
                )}
              </div>

              {habit.currentStreak > 0 && (
                <span className="shrink-0 inline-flex items-center gap-1 text-xs text-ink/60">
                  <Flame size={12} style={{ color: hex }} />
                  {habit.currentStreak}
                </span>
              )}

              {!compact && (
                <div className="shrink-0 flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : habit.id)}
                    title="Edit habit"
                    className={`p-1.5 rounded-lg transition-colors ${isEditing ? "text-signal bg-signal/10" : "text-ink/30 hover:text-ink/60"}`}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => (confirmDeleteId === habit.id ? deleteHabit(habit.id) : setConfirmDeleteId(habit.id))}
                    onBlur={() => setConfirmDeleteId(null)}
                    title="Delete habit"
                    className={`p-1.5 rounded-lg transition-colors ${
                      confirmDeleteId === habit.id ? "text-ember bg-ember/10" : "text-ink/30 hover:text-ink/60"
                    }`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>

            {!compact && !isEditing && (
              <div className="mt-2.5 ml-10">
                <HeatmapGrid habit={habit} onToggle={toggleDay} />
              </div>
            )}

            {!compact && isEditing && (
              <HabitEditForm
                habit={habit}
                onCancel={() => setEditingId(null)}
                onSave={(patch) => saveEdit(habit.id, patch)}
                onArchive={() => saveEdit(habit.id, { archived: true })}
              />
            )}
          </div>
        );
      })}

      {compact && habits.length > 4 && (
        <Link to="/health" className="text-xs text-ink/50 hover:text-ink/80 inline-flex items-center gap-1 pt-1">
          {habits.length - 4} more <ArrowRight size={11} />
        </Link>
      )}

      {!compact && (
        <div className="pt-3 mt-1 border-t border-ink/10 space-y-2">
          <form onSubmit={addHabit} className="flex items-center gap-2">
            <input
              className="ui-input flex-1"
              placeholder="Add a habit or goal..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onFocus={() => setShowNewOptions(true)}
              maxLength={120}
            />
            <button type="submit" disabled={adding || !newName.trim()} className="p-2.5 rounded-lg ui-button-primary">
              <Plus size={16} />
            </button>
          </form>
          {showNewOptions && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <IconPicker value={newIcon} onChange={setNewIcon} />
              <ColorPicker value={newColor} onChange={setNewColor} />
            </div>
          )}
        </div>
      )}
      {compact && (
        <form onSubmit={addHabit} className="flex items-center gap-2 pt-1">
          <input
            className="ui-input flex-1 text-sm"
            placeholder="Add a habit..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={120}
          />
          <button type="submit" disabled={adding || !newName.trim()} className="p-2 rounded-lg ui-button-primary">
            <Plus size={14} />
          </button>
        </form>
      )}

      {!compact && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              const next = !showArchived;
              setShowArchived(next);
              if (next && archived === null) loadArchived();
            }}
            className="text-xs text-ink/45 hover:text-ink/70"
          >
            {showArchived ? "Hide" : "Show"} archived habits
          </button>
          {showArchived && (
            <div className="mt-2 space-y-1.5">
              {archived === null && <p className="text-xs text-ink/40">Loading...</p>}
              {archived?.length === 0 && <p className="text-xs text-ink/40">No archived habits.</p>}
              {archived?.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 text-sm text-ink/60">
                  <span className="flex items-center gap-2 min-w-0">
                    <IconFor iconKey={h.icon} size={13} style={{ color: colorHex(h.color) }} />
                    <span className="truncate">{h.name}</span>
                  </span>
                  <button type="button" onClick={() => restoreHabit(h.id)} className="text-xs text-signal hover:text-signal-soft shrink-0">
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 5-week GitHub-contributions-style grid, each cell independently toggleable
// (not read-only) so someone can also fix/backfill an older day, not just
// see it. Cells with `null` (leading padding before the 35-day window's
// first real date) render as invisible spacers so every week column still
// lines up as exactly 7 cells tall.
function HeatmapGrid({ habit, onToggle }) {
  const weeks = toWeekGrid(habit.heatmap);
  if (!weeks.length) return null;
  const hex = colorHex(habit.color);
  return (
    <div className="flex gap-[3px]">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((day, di) =>
            day ? (
              <button
                key={isoDayKey(day.date)}
                type="button"
                onClick={() => onToggle(habit.id, day.date)}
                title={new Date(day.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                className="w-[11px] h-[11px] rounded-[2.5px] transition-colors"
                style={{ backgroundColor: day.completed ? hex : "rgb(var(--ink) / 0.08)" }}
              />
            ) : (
              <div key={di} className="w-[11px] h-[11px]" />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

function IconPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {ICON_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors ${
            value === key ? "border-signal bg-signal/10 text-signal" : "border-ink/10 text-ink/40 hover:text-ink/70"
          }`}
        >
          <IconFor iconKey={key} size={13} />
        </button>
      ))}
    </div>
  );
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      {COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          title={key}
          className="w-5 h-5 rounded-full border-2 transition-transform"
          style={{
            backgroundColor: colorHex(key),
            borderColor: value === key ? "rgb(var(--ink) / 0.6)" : "transparent",
            transform: value === key ? "scale(1.15)" : "scale(1)",
          }}
        />
      ))}
    </div>
  );
}

// Inline edit panel -- rename, re-icon, re-color, change the weekly target,
// or archive (a reversible pause, distinct from the permanent Trash2
// delete). Opens in place of the heatmap rather than as a modal, since
// every other in-place edit in this app (Journal's title/content, Habit's
// own add form) already favors direct inline editing over a dialog.
function HabitEditForm({ habit, onCancel, onSave, onArchive }) {
  const [name, setName] = useState(habit.name);
  const [icon, setIcon] = useState(habit.icon);
  const [color, setColor] = useState(habit.color);
  const [targetPerWeek, setTargetPerWeek] = useState(habit.targetPerWeek);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setStatus("");
    try {
      await onSave({ name: trimmed, icon, color, targetPerWeek });
    } catch (err) {
      setStatus(describeError(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2.5 ml-10 space-y-2.5 rounded-xl border border-ink/10 p-3">
      <input className="ui-input text-sm" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <IconPicker value={icon} onChange={setIcon} />
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <label className="flex items-center gap-2 text-xs text-ink/60">
        Goal
        <select
          value={targetPerWeek}
          onChange={(e) => setTargetPerWeek(Number(e.target.value))}
          className="ui-input py-1 text-xs w-auto"
        >
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {n}x / week
            </option>
          ))}
        </select>
      </label>
      {status && <p className="text-xs text-ember">{status}</p>}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button type="button" onClick={onArchive} className="text-xs text-ink/45 hover:text-ink/70">
          Archive
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="p-2 rounded-lg text-ink/50 hover:text-ink/80">
            <X size={14} />
          </button>
          <button type="submit" disabled={saving} className="px-3 py-1.5 text-xs ui-button-primary">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
