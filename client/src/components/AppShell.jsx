import { MessageCircle, PenSquare, Settings, HeartPulse } from "lucide-react";
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
    { to: "/journal/new", label: "Write", Icon: PenSquare },
    { to: "/chat", label: "Chat", Icon: MessageCircle },
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
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#1f293766] backdrop-blur px-4 md:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <Link to="/dashboard" className="hover:opacity-90 transition">
            <p className="text-[#d9d2b0] text-xs uppercase tracking-wider">Equoria</p>
            <h1 className="text-lg md:text-xl font-semibold">{title}</h1>
          </Link>
          <div className="hidden md:flex items-center gap-2 flex-wrap justify-end">
            {navItems.map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 border text-base ${
                  location.pathname === to
                    ? "border-[#c6d8a8]/70 bg-[#8fae73]/25 shadow-[0_0_22px_rgba(154,191,117,0.35)] text-white"
                    : "border-white/15 bg-white/5 hover:bg-white/10 text-white/90"
                }`}
              >
                <Icon size={14} />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <div className="min-w-0">
        <Outlet />
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-white/10 bg-[#0b1020]/95 backdrop-blur z-30">
        <div className="grid grid-cols-4 gap-1 px-2 py-2">
          {navItems.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              className={`rounded-lg p-2.5 text-center text-xs ${
                location.pathname === to
                  ? "bg-[#8fae73]/30 shadow-[0_0_18px_rgba(154,191,117,0.3)] text-white"
                  : "text-white/80"
              }`}
            >
              <Icon size={15} className="mx-auto mb-1" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
