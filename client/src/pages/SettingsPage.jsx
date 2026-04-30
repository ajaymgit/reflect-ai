import { useEffect, useState } from "react";

const defaultSettings = {
  reducedMotion: false,
  notificationSounds: true,
  themeMode: "daylight",
  privacyMode: false,
  focusMode: true,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(defaultSettings);

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
    document.body.setAttribute("data-theme-mode", settings.themeMode);
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

  return (
    <main className="p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="glass rounded-2xl p-3">
          <p className="text-[11px] uppercase tracking-wider text-white/65">Jump to section</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => jumpTo(section.id)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>
        <div className="glass rounded-2xl p-5">
        <p className="text-brand-100 text-xs uppercase tracking-wider">Settings</p>
        <h2 className="text-2xl font-semibold mt-1">App Preferences</h2>
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
          <SelectOption
            id="settings-theme"
            title="Theme mode"
            detail="Choose light or dark."
            value={settings.themeMode}
            onChange={(value) => setSettings((prev) => ({ ...prev, themeMode: value }))}
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

function SelectOption({ id, title, detail, value, onChange }) {
  return (
    <div id={id} className="rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg bg-surface-950 border border-white/15 px-2 py-1 text-xs"
        >
          <option value="midnight">Midnight</option>
          <option value="daylight">Daylight</option>
        </select>
      </div>
      <p className="text-xs text-white/70 mt-2">{detail}</p>
    </div>
  );
}
