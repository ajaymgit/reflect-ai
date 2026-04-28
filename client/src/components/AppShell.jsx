import { HeartPulse, LayoutDashboard, MessageCircle, PenSquare, Settings } from "lucide-react";
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
    { to: "/dashboard", label: "Home", Icon: LayoutDashboard },
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
    <div className="min-h-screen page-gradient text-white pb-24 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#111812]/80 px-4 py-3 shadow-[0_16px_50px_rgba(0,0,0,0.22)] backdrop-blur-2xl md:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <Link to="/dashboard" className="group inline-flex items-center gap-3 transition hover:opacity-95">
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-[#d9d2b0]/35 bg-[#d9d2b0]/15 text-[#f2e6bf] shadow-[0_0_28px_rgba(217,210,176,0.16)]">
              <HeartPulse size={20} />
            </span>
            <span>
              <p className="text-[#d9d2b0] text-xs uppercase tracking-[0.28em]">Equoria</p>
              <h1 className="text-lg font-semibold leading-tight md:text-xl">{title}</h1>
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-2 flex-wrap justify-end">
            {navItems.map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 border text-sm font-medium transition ${
                  location.pathname === to
                    ? "border-[#c6d8a8]/70 bg-[#8fae73]/25 shadow-[0_0_24px_rgba(154,191,117,0.28)] text-white"
                    : "border-white/10 bg-white/[0.04] text-white/78 hover:border-white/20 hover:bg-white/10 hover:text-white"
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
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {navItems.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              className={`rounded-xl p-2 text-center text-[11px] transition ${
                location.pathname === to
                  ? "bg-[#8fae73]/30 shadow-[0_0_18px_rgba(154,191,117,0.3)] text-white"
                  : "text-white/70 hover:text-white"
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
