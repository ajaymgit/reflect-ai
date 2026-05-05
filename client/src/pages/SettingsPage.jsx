import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const defaultSettings = {
  reducedMotion: false,
  notificationSounds: true,
  privacyMode: false,
  focusMode: true,
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [settings, setSettings] = useState(defaultSettings);
  const [actionStatus, setActionStatus] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("equoria-settings");
      if (raw) {
        setSettings({ ...defaultSettings, ...JSON.parse(raw) });
      }
    } catch {
      setSettings(defaultSettings);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("equoria-settings", JSON.stringify(settings));
    document.body.setAttribute("data-theme-mode", "daylight");
    document.body.setAttribute("data-reduced-motion", settings.reducedMotion ? "true" : "false");
  }, [settings]);
  const sections = [
    { id: "settings-theme", label: "Appearance" },
    { id: "settings-privacy", label: "Privacy" },
    { id: "settings-focus", label: "Focus" },
    { id: "settings-alerts", label: "Alerts" },
  ];
  function jumpTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <main className="p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <details className="glass rounded-2xl p-3">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-white/65">Jump to section</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => jumpTo(section.id)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 min-h-[44px] text-xs hover:bg-white/10"
              >
                {section.label}
              </button>
            ))}
          </div>
        </details>
        <div className="glass rounded-2xl p-5">
        <p className="text-brand-100 text-xs uppercase tracking-wider">Settings</p>
        <h2 className="text-2xl font-semibold mt-1">App Preferences</h2>
        <p className="text-xs text-white/65 mt-2">Private by default. You control reminders, visibility, and local data.</p>
        <div className="mt-4 grid md:grid-cols-2 gap-3">
          <ToggleOption
            id="settings-motion"
            title="Smoother motion"
            detail="Reduce animations for a calmer screen."
            checked={settings.reducedMotion}
            onChange={() => setSettings((prev) => ({ ...prev, reducedMotion: !prev.reducedMotion }))}
          />
          <ToggleOption
            id="settings-alerts"
            title="Notification sounds"
            detail="Play sounds for saves and replies."
            checked={settings.notificationSounds}
            onChange={() => setSettings((prev) => ({ ...prev, notificationSounds: !prev.notificationSounds }))}
          />
          <ToggleOption
            id="settings-privacy"
            title="Private previews"
            detail="Hide journal text in previews."
            checked={settings.privacyMode}
            onChange={() => setSettings((prev) => ({ ...prev, privacyMode: !prev.privacyMode }))}
          />
          <ToggleOption
            id="settings-focus"
            title="Focus mode"
            detail="Use a cleaner writing screen."
            checked={settings.focusMode}
            onChange={() => setSettings((prev) => ({ ...prev, focusMode: !prev.focusMode }))}
          />
        </div>
      </div>
        <div className="glass rounded-2xl p-5 space-y-3">
          <p className="text-brand-100 text-xs uppercase tracking-wider">Data Control</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-white/15 bg-white/5 min-h-[44px] px-4 py-2 text-sm hover:bg-white/10"
            >
              Logout
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.setItem("equoria_lock_requested", "true");
                setActionStatus("App lock request saved. Re-login to continue.");
              }}
              className="rounded-xl border border-white/15 bg-white/5 min-h-[44px] px-4 py-2 text-sm hover:bg-white/10"
            >
              Lock app
            </button>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("Delete local app data on this device?")) return;
                localStorage.removeItem("equoria-settings");
                localStorage.removeItem("reflectai_token");
                setActionStatus("Local app data removed from this device.");
              }}
              className="rounded-xl border border-red-300/35 bg-red-500/10 text-red-100 min-h-[44px] px-4 py-2 text-sm hover:bg-red-500/20"
            >
              Delete local data
            </button>
          </div>
          {actionStatus ? <p className="text-xs text-white/70">{actionStatus}</p> : null}
        </div>
      </div>
    </main>
  );
}

function ToggleOption({ id, title, detail, checked, onChange }) {
  return (
    <div id={id} className="rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <button
          type="button"
          onClick={onChange}
          className={`rounded-full px-3 py-1 text-xs border ${
            checked ? "bg-brand-300/25 border-brand-100/40" : "bg-white/5 border-white/15"
          }`}
        >
          {checked ? "On" : "Off"}
        </button>
      </div>
      <p className="text-xs text-white/70 mt-2">{detail}</p>
    </div>
  );
}

