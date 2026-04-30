import { Home, LogOut, MessageCircle, PenSquare, Settings, HeartPulse } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const pageTitles = {
  "/dashboard": "Home",
  "/journal/new": "Write Journal",
  "/chat": "Chat",
  "/health": "Body Check",
  "/settings": "Settings",
};

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [showTip, setShowTip] = useState(false);
  const title = pageTitles[location.pathname] || "Home";
  const navItems = [
    { to: "/dashboard", label: "Home", Icon: Home },
    { to: "/journal/new", label: "Journal", Icon: PenSquare },
    { to: "/chat", label: "Chat", Icon: MessageCircle },
    { to: "/health", label: "Body", Icon: HeartPulse },
    { to: "/settings", label: "Settings", Icon: Settings },
  ];

  useEffect(() => {
    try {
      const raw = localStorage.getItem("equoria-settings");
      const settings = raw ? JSON.parse(raw) : null;
      const themeMode = settings?.themeMode === "midnight" ? "midnight" : "daylight";
      document.body.setAttribute("data-theme-mode", themeMode);
      document.body.setAttribute("data-reduced-motion", settings?.reducedMotion ? "true" : "false");
    } catch {
      document.body.setAttribute("data-theme-mode", "daylight");
      document.body.setAttribute("data-reduced-motion", "false");
    }
  }, [location.pathname]);

  useEffect(() => {
    const key = "equoria_onboarding_seen";
    if (!localStorage.getItem(key)) {
      setShowTip(true);
      localStorage.setItem(key, "true");
    }
  }, []);

  function onLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen page-gradient text-white pb-24 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#101a15cc] backdrop-blur-xl px-4 md:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <Link to="/dashboard" className="hover:opacity-90 transition">
            <p className="text-brand-100 text-[11px] uppercase tracking-[0.18em]">ReflectAI</p>
            <h1 className="text-lg md:text-[1.35rem] font-semibold">{title}</h1>
          </Link>
          <div className="hidden md:flex items-center gap-2 flex-wrap justify-end">
            {navItems.map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                aria-current={location.pathname === to ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 border text-[15px] ${
                  location.pathname === to
                    ? "border-brand-100/65 bg-brand-300/25 shadow-[0_12px_26px_rgba(154,191,117,0.24)] text-white"
                    : "border-white/15 bg-white/5 hover:bg-white/10 text-white/90"
                }`}
              >
                <Icon size={15} />
                {label}
              </Link>
            ))}
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 border text-[15px] border-white/15 bg-white/5 hover:bg-white/10 text-white/90"
            >
              <LogOut size={15} />
              Logout
            </button>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="md:hidden inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/90"
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </header>
      {showTip ? (
        <div className="px-4 md:px-6 pt-3">
          <div className="max-w-7xl mx-auto rounded-xl border border-brand-200/40 bg-brand-300/15 px-3 py-2 text-sm text-white/85 flex items-center justify-between gap-3">
            <span>New here? Start with Home -&gt; Write Journal -&gt; Chat -&gt; Look Back.</span>
            <button type="button" onClick={() => setShowTip(false)} className="text-xs rounded-lg px-2 py-1 bg-white/10 hover:bg-white/20">
              Hide
            </button>
          </div>
        </div>
      ) : null}

      <div className="min-w-0">
        <Outlet />
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-white/10 bg-[#0b1020]/95 backdrop-blur z-30 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {navItems.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              aria-current={location.pathname === to ? "page" : undefined}
              className={`rounded-lg p-2.5 text-center text-xs ${
                location.pathname === to
                  ? "bg-brand-300/30 shadow-[0_0_18px_rgba(154,191,117,0.3)] text-white"
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
