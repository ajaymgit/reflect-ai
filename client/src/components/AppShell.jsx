import { Flame, Home, MessageCircle, PenSquare, Settings, HeartPulse, LineChart, Sparkles, MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import Onboarding from "./Onboarding";

const pageTitles = {
  "/dashboard": "Home",
  "/journal/new": "Journal",
  "/year-in-review": "Year in Review",
  "/retrospect": "Retrospect",
  "/chat": "Chat",
  "/health": "Health",
  "/settings": "Settings",
  "/more": "More",
};

// Grouped, not flat -- previously every section (Home, Write, History, Chat,
// Retrospect, Health, Settings) sat in one undifferentiated row, with no
// signal that e.g. "Write" and "History" are two halves of the same journal
// feature, or that Retrospect/Year in Review/Health are all "look back at
// yourself" features. Grouping with section labels (the same pattern Notion,
// Linear, and most mature multi-feature products use for a sidebar once an
// app has more than ~5 top-level destinations) is what "best organization of
// all the features" actually means structurally, not just a visual reskin.
// Year in Review is included here for the first time ever -- it previously
// had zero entries in either nav, reachable only via a small text link
// buried in Retrospect's header.
const navGroups = [
  { label: null, items: [{ to: "/dashboard", label: "Home", Icon: Home }] },
  {
    label: null,
    items: [{ to: "/journal/new", label: "Journal", Icon: PenSquare }],
  },
  { label: null, items: [{ to: "/chat", label: "Chat", Icon: MessageCircle }] },
  {
    label: "Insights",
    items: [
      { to: "/retrospect", label: "Retrospect", Icon: LineChart },
      { to: "/year-in-review", label: "Year in Review", Icon: Sparkles },
      { to: "/health", label: "Health", Icon: HeartPulse },
    ],
  },
  { label: null, items: [{ to: "/settings", label: "Settings", Icon: Settings }] },
];

// Mobile keeps a bottom tab bar (small-screen real estate can't fit 8 grouped
// items the way the sidebar can), condensed to the 5 destinations someone
// reaches for constantly -- History, Retrospect, Year in Review, and
// Settings move behind "More" instead of forcing an 8-wide scrolling strip.
const mobilePrimaryItems = [
  { to: "/dashboard", label: "Home", Icon: Home },
  { to: "/journal/new", label: "Write", Icon: PenSquare },
  { to: "/chat", label: "Chat", Icon: MessageCircle },
  { to: "/health", label: "Health", Icon: HeartPulse },
  { to: "/more", label: "More", Icon: MoreHorizontal },
];

const moreRoutes = new Set(["/retrospect", "/year-in-review", "/settings", "/more"]);

export default function AppShell() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || "Home";
  const isMoreActive = moreRoutes.has(location.pathname);
  // Momentum indicator on the Journal nav item -- previously a streak was
  // only ever visible after opening Dashboard; this surfaces it right in
  // the nav so it's a constant, low-effort reminder rather than something
  // that has to be looked up. One lightweight fetch of the same summary
  // endpoint Dashboard already calls, not a new server route.
  const [streak, setStreak] = useState(0);
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    apiFetch("/api/dashboard/summary")
      .then((data) => setStreak(data.journalingStreak || 0))
      .catch(() => {});
  }, []);

  // First-run onboarding -- shown once per account (see Onboarding.jsx),
  // tracked with a localStorage flag scoped to the account's id so a shared
  // device with multiple accounts doesn't skip it for the second person.
  useEffect(() => {
    if (!user?.id) return;
    try {
      const seen = localStorage.getItem(`equoria-onboarded-${user.id}`);
      if (!seen) setShowOnboarding(true);
    } catch {
      // ignore -- worst case onboarding just doesn't show
    }
  }, [user?.id]);

  function dismissOnboarding() {
    if (user?.id) {
      try {
        localStorage.setItem(`equoria-onboarded-${user.id}`, "1");
      } catch {
        // ignore
      }
    }
    setShowOnboarding(false);
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem("equoria-settings");
      const settings = raw ? JSON.parse(raw) : null;
      const themeMode = settings?.themeMode === "midnight" ? "midnight" : "daylight";
      document.body.setAttribute("data-theme-mode", themeMode);
    } catch {
      document.body.setAttribute("data-theme-mode", "daylight");
    }
  }, [location.pathname]);

  return (
    <div className="min-h-screen page-gradient text-white pb-20 md:pb-0 md:flex">
      {/* Desktop sidebar -- replaces the old horizontal pill row entirely.
          Sits alongside content rather than above it, so it can show every
          destination, grouped, all the time, instead of the old row that
          would have needed to wrap or scroll once Year in Review was added
          as an 8th item. Background is an olive-dark tone matching
          .page-gradient/.ui-card's rgba(32,45,38,...) family -- previously
          a slate-navy (#1f2937) hex that visibly clashed against the
          olive/forest theme underneath it, like a leftover template shell
          wrapped around a different app. */}
      <aside className="hidden md:flex md:flex-col md:w-60 md:shrink-0 border-r border-white/10 bg-[#151f1a]/85 backdrop-blur px-4 py-5 md:sticky md:top-0 md:h-screen md:overflow-y-auto scroll-area">
        <Link to="/dashboard" className="block px-2 mb-6 hover:opacity-90 transition">
          <p className="ui-kicker text-[#d9d2b0]">Equoria</p>
          <p className="text-lg font-semibold" style={{ fontFamily: "Fraunces, Georgia, serif" }}>
            Reflect
          </p>
        </Link>
        <nav className="flex-1 space-y-5">
          {navGroups.map((group, i) => (
            <div key={group.label || `group-${i}`}>
              {group.label && (
                <p className="ui-kicker px-2 mb-1.5 text-white/55">{group.label}</p>
              )}
              <div className="space-y-1">
                {group.items.map(({ to, label, Icon }) => {
                  const isActive = location.pathname === to;
                  return (
                    <Link
                      key={to}
                      to={to}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border text-sm transition ${
                        isActive ? "text-white" : "border-transparent text-white/80 hover:bg-white/5"
                      }`}
                      // Same --user-light-driven active state the old top nav
                      // pill used, kept identical so the Settings -> Appearance
                      // hue slider still reaches the nav no matter where it lives.
                      style={
                        isActive
                          ? {
                              borderColor: "color-mix(in srgb, var(--user-light, #c6d8a8) 70%, transparent)",
                              background: "color-mix(in srgb, var(--user-light, #8fae73) 22%, transparent)",
                            }
                          : undefined
                      }
                    >
                      <Icon size={16} />
                      {label}
                      {to === "/journal/new" && streak > 0 && (
                        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[#e8ab5f]">
                          <Flame size={11} />
                          {streak}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#151f1a]/85 backdrop-blur px-4 md:px-6 py-3 md:hidden">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <Link to="/dashboard" className="hover:opacity-90 transition">
              <p className="ui-kicker text-[#d9d2b0]">Equoria</p>
              <h1 className="text-base font-semibold">{title}</h1>
            </Link>
          </div>
        </header>

        <div key={location.pathname} className="min-w-0 page-transition">
          <Outlet />
        </div>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-white/10 bg-[#10150f]/95 backdrop-blur z-30">
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {mobilePrimaryItems.map(({ to, label, Icon }) => {
            const isActive = to === "/more" ? isMoreActive : location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`rounded-lg p-2 text-center text-[10px] ${isActive ? "text-white" : "text-white/80"}`}
                style={
                  isActive
                    ? {
                        background: "color-mix(in srgb, var(--user-light, #8fae73) 30%, transparent)",
                        boxShadow: "0 0 18px color-mix(in srgb, var(--user-light, #9abf75) 30%, transparent)",
                      }
                    : undefined
                }
              >
                <span className="relative inline-block">
                  <Icon size={14} className="mx-auto mb-1" />
                  {to === "/journal/new" && streak > 0 && (
                    <span className="absolute -top-0.5 -right-1 h-1.5 w-1.5 rounded-full bg-[#e8ab5f]" />
                  )}
                </span>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {showOnboarding && <Onboarding onDone={dismissOnboarding} />}
    </div>
  );
}
