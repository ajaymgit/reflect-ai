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

  return (
    <main className="p-4 md:p-6">
      <div className="max-w-4xl mx-auto glass rounded-2xl p-5">
        <p className="text-brand-100 text-xs uppercase tracking-wider">Settings</p>
        <h2 className="text-2xl font-semibold mt-1">App Preferences</h2>
        <div className="mt-4 grid md:grid-cols-2 gap-3">
          <ToggleOption
            title="Smoother motion"
            detail="Reduce moving effects if you prefer a calmer screen."
            checked={settings.reducedMotion}
            onChange={() => setSettings((prev) => ({ ...prev, reducedMotion: !prev.reducedMotion }))}
          />
          <ToggleOption
            title="Notification sounds"
            detail="Play soft sounds when entries save and chat replies arrive."
            checked={settings.notificationSounds}
            onChange={() => setSettings((prev) => ({ ...prev, notificationSounds: !prev.notificationSounds }))}
          />
          <SelectOption
            title="Theme mode"
            detail="Choose a bright or dark look."
            value={settings.themeMode}
            onChange={(value) => setSettings((prev) => ({ ...prev, themeMode: value }))}
          />
          <ToggleOption
            title="Private previews"
            detail="Hide journal preview text on timeline cards."
            checked={settings.privacyMode}
            onChange={() => setSettings((prev) => ({ ...prev, privacyMode: !prev.privacyMode }))}
          />
          <ToggleOption
            title="Focus mode"
            detail="Show a cleaner writing screen with fewer distractions."
            checked={settings.focusMode}
            onChange={() => setSettings((prev) => ({ ...prev, focusMode: !prev.focusMode }))}
          />
        </div>
      </div>
    </main>
  );
}

function ToggleOption({ title, detail, checked, onChange }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
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

function SelectOption({ title, detail, value, onChange }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
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
