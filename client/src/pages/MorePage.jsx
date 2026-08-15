import { Link } from "react-router-dom";
import { ChevronRight, HeartPulse, LineChart, Settings, Sparkles } from "lucide-react";

// Mobile-only overflow destination -- see AppShell.jsx's mobilePrimaryItems.
// The bottom tab bar only has room for 5 icons before it turns into a
// cramped, tiny-tap-target scroll strip, so the less-frequently-opened
// destinations (Retrospect, Year in Review, Settings -- all still full
// entries in the desktop sidebar) live here instead of being crammed into
// the bar itself. Desktop users never see this page; the sidebar already
// shows everything at once. Journal history used to have its own tile here
// too, but it's not a separate destination anymore -- it's the "History" tab
// inside Write (already one of the 5 primary bottom-bar icons), so it was
// dropped rather than pointed at the /journal/new?view=history redirect.
const items = [
  {
    to: "/retrospect",
    label: "Retrospect",
    desc: "Patterns, correlations, and reflective prompts",
    Icon: LineChart,
  },
  {
    to: "/year-in-review",
    label: "Year in review",
    desc: "Your last 12 months, summarized",
    Icon: Sparkles,
  },
  {
    to: "/health",
    label: "Health",
    desc: "Sleep, activity, and how they track with mood",
    Icon: HeartPulse,
  },
  {
    to: "/settings",
    label: "Settings",
    desc: "Account, appearance, reminders, export",
    Icon: Settings,
  },
];

export default function MorePage() {
  return (
    <main className="ui-page">
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <p className="ui-kicker">Everything else</p>
          <h2 className="ui-title">More</h2>
        </div>

        <div className="ui-card rounded-2xl divide-y divide-white/8 overflow-hidden">
          {items.map(({ to, label, desc, Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 px-4 py-4 hover:bg-white/5 transition"
            >
              <Icon size={18} className="text-white/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-white/50 mt-0.5">{desc}</p>
              </div>
              <ChevronRight size={16} className="text-white/45 shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
