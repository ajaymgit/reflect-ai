import { Flame, Home, MessageCircle, PenSquare, Settings, HeartPulse, LineChart, PartyPopper, MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import Onboarding from "./Onboarding";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";
import { applyStoredTheme } from "../utils/theme";

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
      { to: "/year-in-review", label: "Year in Review", Icon: PartyPopper },
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
  const reducedMotion = usePrefersReducedMotion();
  const location = useLocation();
  const title = pageTitles[location.pathname] || "Home";
  const isMoreActive = moreRoutes.has(location.pathname);

  // Every route inside the app previously left the browser tab reading the
  // static "ReflectAI" from index.html forever -- with several tabs open
  // (Chat in one, Health in another) there was no way to tell them apart
  // without clicking into each. Reuses the same pageTitles map the mobile
  // header already renders, so there's one source of truth for "what this
  // route is called," not a second copy to keep in sync.
  useEffect(() => {
    document.title = `${title} - Equoria`;
  }, [title]);
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

  // Was theme-mode-only (just the data-theme-mode attribute) -- but the
  // Appearance hue overrides (--user-dark/--user-light/--paper-raised/
  // --paper-sunken) had no equivalent anywhere outside SettingsPage.jsx's
  // own effects, so a customization only ever rendered while Settings
  // itself was mounted. Landing directly on any other route (a bookmark, a
  // hard refresh, a shared link) showed the theme's uncustomized colors
  // even though a customization was saved -- confirmed live. applyStoredTheme
  // (see utils/theme.js) covers both the mode and the three hue overrides in
  // one read of localStorage, run on every route change so it's also
  // correct after switching themes/colors in another tab.
  useEffect(() => {
    applyStoredTheme();
  }, [location.pathname]);

  return (
    <div className="min-h-screen page-gradient text-ink pb-20 md:pb-0 md:flex">
      {/* Desktop sidebar -- sits alongside content rather than above it, so
          it can show every destination, grouped, all the time. Solid
          paper.raised, not a translucent background plus backdrop-blur --
          "frosted glass" chrome is exactly the kind of default-AI-generated
          polish this system deliberately avoids everywhere else (flat
          surfaces, real borders, no blur), so the nav shouldn't be the one
          place that still has it. */}
      <aside className="hidden md:flex md:flex-col md:w-60 md:shrink-0 border-r border-ink/10 bg-paper-raised px-4 py-5 md:sticky md:top-0 md:h-screen md:overflow-y-auto scroll-area">
        {/* Real wordmark presence: bigger serif "Reflect", small gold accent
            mark standing in for a logo, "Equoria" demoted to a quiet mono
            sub-label underneath instead of leading. */}
        <Link to="/dashboard" className="flex items-center gap-2.5 px-2 mb-8 hover:opacity-90 transition">
          <span className="h-2 w-2 rounded-full shrink-0 bg-accent-ember" />
          <div>
            <p className="text-xl font-semibold leading-none font-display">Reflect</p>
            <p className="ui-kicker text-ink-faint mt-1">Equoria</p>
          </div>
        </Link>
        <nav className="flex-1 space-y-6">
          {navGroups.map((group, i) => (
            <div key={group.label || `group-${i}`}>
              {group.label && <p className="ui-kicker px-3 mb-2 text-ink-faint">{group.label}</p>}
              <div className="space-y-0.5">
                {group.items.map(({ to, label, Icon }) => {
                  const isActive = location.pathname === to;
                  return (
                    <Link
                      key={to}
                      to={to}
                      // Left-edge accent bar instead of a bordered/tinted
                      // pill -- a tab indicator, not a button, since these
                      // are destinations not actions. Text weight (not just
                      // color) does real work too: active items are
                      // genuinely bolder, not just brighter.
                      className={`relative flex items-center gap-2.5 rounded-lg pl-3 pr-3 py-2.5 text-sm transition ${
                        isActive ? "text-ink font-medium bg-ink/[0.06]" : "text-ink-muted hover:text-ink hover:bg-ink/5"
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId={reducedMotion ? undefined : "nav-active-indicator"}
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
                          style={{ background: "var(--user-light, rgb(var(--signal)))" }}
                        />
                      )}
                      <Icon size={16} className={isActive ? "" : "text-ink-faint"} />
                      {label}
                      {to === "/journal/new" && streak > 0 && (
                        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-accent-ember">
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
        <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper-raised px-4 md:px-6 py-3 md:hidden">
          <div className="max-w-7xl mx-auto flex items-center gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-accent-ember" />
            <Link to="/dashboard" className="hover:opacity-90 transition">
              <h1 className="text-base font-semibold font-display">{title}</h1>
            </Link>
          </div>
        </header>

        <div key={location.pathname} className="min-w-0 page-transition">
          <Outlet />
        </div>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-ink/10 bg-paper-sunken z-30">
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {mobilePrimaryItems.map(({ to, label, Icon }) => {
            const isActive = to === "/more" ? isMoreActive : location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`relative rounded-lg p-2 text-center text-[10px] ${isActive ? "text-ink" : "text-ink-muted"}`}
              >
                {isActive && (
                  <motion.span
                    layoutId={reducedMotion ? undefined : "mobile-nav-active"}
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    className="absolute inset-0 rounded-lg -z-10"
                    style={{
                      background: "color-mix(in srgb, var(--user-light, rgb(var(--signal))) 30%, transparent)",
                      boxShadow: "0 0 18px color-mix(in srgb, var(--user-light, rgb(var(--signal-soft))) 30%, transparent)",
                    }}
                  />
                )}
                <span className="relative inline-block">
                  <Icon size={14} className="mx-auto mb-1" />
                  {to === "/journal/new" && streak > 0 && (
                    <span className="absolute -top-0.5 -right-1 h-1.5 w-1.5 rounded-full bg-accent-ember" />
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
