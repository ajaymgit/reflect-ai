import { Home, MessageCircle, PenSquare, Settings, HeartPulse, LineChart } from "lucide-react";
import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

const pageTitles = {
  "/dashboard": "Home",
  "/journal/new": "New Journal",
  "/retrospect": "Retrospect",
  "/chat": "Chat",
  "/health": "Health",
  "/settings": "Settings",
};

export default function AppShell() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || "Home";
  const navItems = [
    { to: "/dashboard", label: "Home", Icon: Home },
    { to: "/journal/new", label: "Write", Icon: PenSquare },
    { to: "/chat", label: "Chat", Icon: MessageCircle },
    // Was previously missing from nav entirely -- the /retrospect route
    // existed but had no link anywhere in the app, so it was unreachable
    // without typing the URL directly.
    { to: "/retrospect", label: "Retrospect", Icon: LineChart },
    { to: "/health", label: "Health", Icon: HeartPulse },
    { to: "/settings", label: "Settings", Icon: Settings },
  ];

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
    <div className="min-h-screen page-gradient text-white pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#1f293766] backdrop-blur px-4 md:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <Link to="/dashboard" className="hover:opacity-90 transition">
            <p className="text-[#d9d2b0] text-xs uppercase tracking-wider">Equoria</p>
            <h1 className="text-base md:text-xl font-semibold">{title}</h1>
          </Link>
          <div className="hidden md:flex items-center gap-2 flex-wrap justify-end">
            {navItems.map(({ to, label, Icon }) => {
              const isActive = location.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 border text-sm ${
                    isActive ? "text-white" : "border-white/15 bg-white/5 hover:bg-white/10 text-white/90"
                  }`}
                  // The active nav pill is on screen on every page at all
                  // times, so it's tied directly to the "Light color" slider
                  // (Settings -> Appearance) via CSS var -- moving that
                  // slider now has an immediately visible effect no matter
                  // which page you're looking at, instead of only affecting
                  // buttons/glows that are easy to never actually see.
                  style={
                    isActive
                      ? {
                          borderColor: "color-mix(in srgb, var(--user-light, #c6d8a8) 70%, transparent)",
                          background: "color-mix(in srgb, var(--user-light, #8fae73) 25%, transparent)",
                          boxShadow: "0 0 22px color-mix(in srgb, var(--user-light, #9abf75) 35%, transparent)",
                        }
                      : undefined
                  }
                >
                  <Icon size={14} />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      <div className="min-w-0">
        <Outlet />
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-white/10 bg-[#0b1020]/95 backdrop-blur z-30">
        <div className="grid grid-cols-6 gap-1 px-2 py-2 overflow-x-auto">
          {navItems.map(({ to, label, Icon }) => {
            const isActive = location.pathname === to;
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
                <Icon size={14} className="mx-auto mb-1" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
