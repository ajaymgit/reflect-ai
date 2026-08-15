import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Download, HeartPulse, LogOut, Palette, ShieldCheck, UserRound } from "lucide-react";
import { apiFetch, describeError } from "../api";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput";

// One icon-led card per section instead of a single vertical stack of
// visually identical bordered boxes -- previously every section (Appearance,
// Account, Reminders, Security, Integrations, Data) looked the same weight
// regardless of what it actually did, which made a genuinely capable
// settings page (real 2FA, real data export, per-account reminders, a live
// theme customizer) read as flatter/less finished than the rest of the app.
function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="ui-card rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-white/50" />
        <p className="ui-kicker">{title}</p>
      </div>
      {children}
    </div>
  );
}

// Hue (0-360) for each slider's default position -- chosen to match this
// app's actual existing dark-green background (~150) and light-green accent
// (~95) tones, so the sliders start wherever the app already looked before
// this feature existed, instead of snapping to an arbitrary color the first
// time someone opens Settings.
const DEFAULT_DARK_HUE = 150;
const DEFAULT_LIGHT_HUE = 95;

const defaultSettings = {
  themeMode: "daylight",
  darkHue: DEFAULT_DARK_HUE,
  lightHue: DEFAULT_LIGHT_HUE,
};

// h: 0-360, s/l: 0-100. Plain HSL->hex, no library needed for one conversion.
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n) => Math.round(255 * f(n)).toString(16).padStart(2, "0");
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem("equoria-settings");
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export default function SettingsPage() {
  // Reading localStorage in the lazy useState initializer (rather than in a
  // separate mount effect that calls setSettings after the fact) means
  // `settings` is correct from the very first render -- no
  // default-then-loaded double-render, which matters below: the veil effect
  // needs to see the REAL saved theme on its first run, not "daylight"
  // followed immediately by a spurious "loaded value" transition that would
  // otherwise trigger a jarring veil flash on every page load for anyone
  // whose saved theme isn't the default.
  const [settings, setSettings] = useState(loadSettings);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutStatus, setLogoutStatus] = useState("");
  const { logout, user, setUser } = useAuth();
  const navigate = useNavigate();

  async function handleLogoutEverywhere() {
    if (!window.confirm("Log out on every device and browser, including this one?")) return;
    setLoggingOut(true);
    setLogoutStatus("");
    try {
      // Backend revokes every access/refresh token issued before this call
      // (POST /api/auth/logout-all bumps the account's tokenVersion) -- this
      // is a real server-side revocation, not just clearing local storage.
      await apiFetch("/api/auth/logout-all", { method: "POST" });
      logout();
      navigate("/login");
    } catch (err) {
      setLogoutStatus(describeError(err));
      setLoggingOut(false);
    }
  }

  useEffect(() => {
    localStorage.setItem("equoria-settings", JSON.stringify(settings));
  }, [settings]);

  // Sets on <html> (not <body>) so the vars are visible to every stylesheet
  // rule regardless of specificity/ordering. Each slider only stores a hue
  // (0-360); saturation/lightness are fixed per role so "dark" always comes
  // out dark and "light" always comes out light no matter what hue is
  // picked -- index.css reads these via var(--user-dark, <original>) /
  // var(--user-light, <original>) etc, so as long as this effect has run
  // once (it always has, since darkHue/lightHue are never null) the sliders'
  // current position is exactly what's rendered everywhere.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--user-dark", hslToHex(settings.darkHue, 18, 13));
    root.style.setProperty("--user-light", hslToHex(settings.lightHue, 30, 58));
    root.style.setProperty("--user-light-soft", hslToHex(settings.lightHue, 30, 73));
    root.style.setProperty("--user-light-glow", `hsla(${settings.lightHue}, 30%, 58%, 0.32)`);
  }, [settings.darkHue, settings.lightHue]);

  // Applying data-theme-mode instantly on toggle used to just snap between
  // the two palettes. A radial-gradient background (.page-gradient) can't be
  // reliably CSS-transitioned across browsers, so instead of animating the
  // gradient itself, a full-screen veil fades to opaque, the attribute
  // flips underneath it, then it fades back out -- reads as a smooth
  // crossfade. Skipped on the very first render (applying the value you
  // already had saved shouldn't flash a veil on page load).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      document.body.setAttribute("data-theme-mode", settings.themeMode);
      return;
    }
    const veil = document.createElement("div");
    veil.className = "theme-transition-veil";
    document.body.appendChild(veil);
    // eslint-disable-next-line no-unused-expressions
    veil.offsetHeight; // force layout so the next class add actually transitions
    veil.classList.add("veil-active");

    const flip = setTimeout(() => {
      document.body.setAttribute("data-theme-mode", settings.themeMode);
      veil.classList.remove("veil-active");
    }, 280);
    const cleanup = setTimeout(() => veil.remove(), 280 + 320);

    return () => {
      clearTimeout(flip);
      clearTimeout(cleanup);
      veil.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.themeMode]);

  return (
    <main className="ui-page">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="ui-card rounded-2xl p-5">
          <p className="ui-kicker">Settings</p>
          <h2 className="ui-title mt-1">Preferences</h2>
        </div>

        {/* Two columns on desktop instead of one long vertical stack --
            matching the card-grid pattern Dashboard already uses for its
            Health/Retrospect preview row, so each section reads as its own
            card rather than one more box in an undifferentiated list. */}
        <div className="grid md:grid-cols-2 gap-4 items-start">
          <div className="space-y-4">
            {/* Theme mode + the two hue sliders used to be two separate,
                visually unrelated boxes even though they're the same
                "how the app looks" concern -- one card now, plus a live
                preview swatch so the effect of dragging a slider is visible
                without leaving the page. */}
            <SectionCard icon={Palette} title="Appearance">
              <SelectOption
                title="Theme mode"
                detail="Switch instantly between bright and deep background modes."
                value={settings.themeMode}
                onChange={(value) => setSettings((prev) => ({ ...prev, themeMode: value }))}
              />
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                <HueSlider
                  label="Dark color"
                  detail="The app's main background."
                  hue={settings.darkHue}
                  saturation={18}
                  lightness={13}
                  defaultHue={DEFAULT_DARK_HUE}
                  onChange={(hue) => setSettings((prev) => ({ ...prev, darkHue: hue }))}
                />
                <HueSlider
                  label="Light color"
                  detail="Buttons and highlight accents."
                  hue={settings.lightHue}
                  saturation={30}
                  lightness={58}
                  defaultHue={DEFAULT_LIGHT_HUE}
                  onChange={(hue) => setSettings((prev) => ({ ...prev, lightHue: hue }))}
                />
              </div>
              <AppearancePreview darkHue={settings.darkHue} lightHue={settings.lightHue} />
              <p className="text-xs text-white/50 mt-2">Applies instantly across the whole app.</p>
            </SectionCard>

            <SectionCard icon={UserRound} title="Account">
              {/* No inner .surface box here -- previously this single info
                  block sat in its own bordered box nested inside the
                  SectionCard's own border, a card-in-a-card for content that
                  never needed the extra separation. */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-white/50 uppercase tracking-wide">Name</p>
                  <p className="text-sm mt-1">{user?.name || "--"}</p>
                </div>
                <div>
                  <p className="text-xs text-white/50 uppercase tracking-wide">Email</p>
                  <p className="text-sm mt-1">{user?.email || "--"}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard icon={Bell} title="Reminders">
              <ReminderSection user={user} setUser={setUser} />
            </SectionCard>
          </div>

          <div className="space-y-4">
            <SectionCard icon={LogOut} title="Security">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium">Log out everywhere</p>
                  <p className="text-xs text-white/70 mt-1 max-w-md">
                    Signs you out on every device and browser, including this one. Use this if you
                    think someone else may have access to your account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogoutEverywhere}
                  disabled={loggingOut}
                  className="ui-button-danger px-4 py-2.5 min-h-11 text-sm disabled:opacity-60"
                >
                  {loggingOut ? "Logging out..." : "Log out everywhere"}
                </button>
              </div>
              {logoutStatus && <p className="text-xs text-red-300 mt-2">{logoutStatus}</p>}
            </SectionCard>

            {/* Split out from Security into its own card -- previously both
                lived under one "Security" heading and the combined block
                was the single busiest, most text-heavy section on the
                page. */}
            <SectionCard icon={ShieldCheck} title="Two-factor authentication">
              <TwoFactorSection user={user} setUser={setUser} />
            </SectionCard>

            <SectionCard icon={HeartPulse} title="Integrations">
              <AppleHealthSection />
            </SectionCard>

            <SectionCard icon={Download} title="Your data">
              <ExportSection />
            </SectionCard>
          </div>
        </div>
      </div>
    </main>
  );
}

// Small mockup card painted with the two colors the sliders above actually
// control -- computed directly from the live hue state (not the CSS custom
// properties, which only update once the settings-change effect runs),
// so dragging a slider updates this preview in the same render.
function AppearancePreview({ darkHue, lightHue }) {
  const bg = hslToHex(darkHue, 18, 13);
  const light = hslToHex(lightHue, 30, 58);
  return (
    <div className="mt-3 rounded-xl p-3 border border-white/10" style={{ background: bg }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: light, fontFamily: '"IBM Plex Mono", monospace' }}>
        Preview
      </p>
      <button
        type="button"
        tabIndex={-1}
        className="mt-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold pointer-events-none"
        style={{ background: light, color: "#16210f" }}
      >
        Button
      </button>
    </div>
  );
}

// "Download all my data" -- a trust/portability feature standard on Day One,
// Reflectly, etc. that was previously entirely absent here: there was no way
// to get your own journal, health, retrospect, or chat data out of the app.
// Backed by GET /api/export/all (see server/src/modules/export/routes.js).
// Fetched manually here (not via the shared apiFetch helper) since that
// helper always calls res.json() and returns parsed data -- this needs the
// raw response as a Blob so the browser can trigger an actual file download
// via a temporary object URL, not just hand back a JS object.
function ExportSection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function exportData() {
    setBusy(true);
    setError("");
    try {
      const apiBase = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const token = localStorage.getItem("reflectai_token");
      const res = await fetch(`${apiBase}/api/export/all`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed. Please try again.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reflectai-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.message || "Export failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">Export your data</p>
          <p className="text-xs text-white/70 mt-1 max-w-md">
            Download every journal entry, health reading, retrospect analysis, and chat message as one JSON file.
          </p>
        </div>
        <button
          type="button"
          onClick={exportData}
          disabled={busy}
          className="ui-button-ghost px-4 py-2.5 min-h-11 text-sm disabled:opacity-60"
        >
          {busy ? "Preparing..." : "Download my data"}
        </button>
      </div>
      {error && <p className="text-xs text-red-300 mt-2">{error}</p>}
    </div>
  );
}

// Lets each account pick its own daily journaling-reminder hour, or turn
// reminders off entirely -- backed by PATCH /api/auth/reminder-preferences
// (see server/src/modules/auth/routes.js) and read by the hourly
// send-reminders script (server/src/scripts/sendJournalingReminders.js).
// Saves immediately on change (no separate Save button) since there are only
// two small controls here.
function formatHour(h) {
  const period = h >= 12 ? "PM" : "AM";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${period}`;
}

function ReminderSection({ user, setUser }) {
  const [enabled, setEnabled] = useState(user?.reminderEnabled ?? true);
  const [hour, setHour] = useState(user?.reminderHour ?? 20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEnabled(user?.reminderEnabled ?? true);
    setHour(user?.reminderHour ?? 20);
  }, [user?.reminderEnabled, user?.reminderHour]);

  async function save(nextEnabled, nextHour) {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const data = await apiFetch("/api/auth/reminder-preferences", {
        method: "PATCH",
        body: JSON.stringify({ enabled: nextEnabled, hour: nextHour }),
      });
      setUser((prev) => ({ ...prev, ...data }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 surface p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">Daily journaling reminder</p>
          <p className="text-xs text-white/70 mt-1 max-w-md">
            A gentle email nudge if you haven't journaled yet by your chosen time.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              const next = e.target.checked;
              setEnabled(next);
              save(next, hour);
            }}
            className="w-4 h-4"
          />
          <span className="text-xs text-white/70">{enabled ? "On" : "Off"}</span>
        </label>
      </div>

      {enabled && (
        <div className="mt-3 flex items-center gap-3 border-t border-white/10 pt-3">
          <p className="text-xs text-white/70">Remind me around</p>
          <select
            value={hour}
            onChange={(e) => {
              const next = Number(e.target.value);
              setHour(next);
              save(enabled, next);
            }}
            // Same visual language as .ui-input (background/border/focus
            // color) without importing its width:100% -- that would fight
            // this flex row's layout. Previously a hardcoded near-black navy
            // (#111827) that looked like a different, unstyled control next
            // to every real .ui-input field elsewhere in the app.
            className="rounded-[0.8rem] bg-[#101814]/90 border border-white/15 px-3 py-1.5 text-xs outline-none focus:border-[#c5d7a6]"
          >
            {Array.from({ length: 24 }).map((_, h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </select>
          {busy && <span className="text-xs text-white/50">Saving...</span>}
          {saved && !busy && <span className="text-xs text-emerald-300">Saved</span>}
        </div>
      )}
      {error && <p className="text-xs text-red-300 mt-2">{error}</p>}
    </div>
  );
}

// Generates the long-lived token the iOS companion app uses to authenticate
// its background sync requests (POST /api/health-data/sync) -- see
// server/src/modules/auth/routes.js's /health-sync-token route. The raw
// token is only ever visible right after generating it; only its hash is
// stored server-side, same as a password reset token, so there's no way to
// display it again later -- regenerating is the only recovery path if it's
// lost, and immediately invalidates whatever token was issued before it.
function AppleHealthSection() {
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const syncUrl = `${apiBase}/api/health-data/sync`;

  async function generateToken() {
    if (token && !window.confirm("Generating a new token immediately invalidates the current one. Continue?")) return;
    setError("");
    setBusy(true);
    try {
      const data = await apiFetch("/api/auth/health-sync-token", { method: "POST" });
      setToken(data.token);
      setCopied(false);
      // Encodes the same two values the setup screen asks for (server URL +
      // token) as JSON, so the companion app's camera scanner can fill both
      // fields in one shot instead of the user typing/pasting either one.
      const QRCode = (await import("qrcode")).default;
      const payload = JSON.stringify({ serverURL: apiBase, token: data.token });
      const dataUrl = await QRCode.toDataURL(payload, { width: 220, margin: 1 });
      setQrDataUrl(dataUrl);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  function copyToken() {
    navigator.clipboard?.writeText(token);
    setCopied(true);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">Apple Health</p>
          <p className="text-xs text-white/70 mt-1 max-w-md">
            Sync real steps, sleep, and heart rate from your iPhone via the ReflectHealthSync companion app, instead
            of relying on manually logged numbers.
          </p>
        </div>
        <button
          type="button"
          onClick={generateToken}
          disabled={busy}
          className="ui-button-ghost px-4 py-2.5 min-h-11 text-sm disabled:opacity-60"
        >
          {busy ? "Generating..." : token ? "Regenerate token" : "Generate sync token"}
        </button>
      </div>

      {error && <p className="text-xs text-red-300 mt-2">{error}</p>}

      {token && (
        <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            {qrDataUrl && (
              <div className="shrink-0 rounded-xl overflow-hidden border border-white/15 bg-white p-2">
                <img src={qrDataUrl} alt="QR code with server URL and sync token" width={140} height={140} />
              </div>
            )}
            <div className="flex-1 space-y-2 min-w-0">
              <p className="text-xs text-white/70">
                In the ReflectHealthSync app, tap "Scan QR Code" and point your camera at this -- it fills in the
                server URL and token for you. Won't be shown again after you leave this page.
              </p>
              <div className="flex items-center gap-2">
                <p className="text-xs font-mono break-all bg-black/30 rounded-lg p-2 flex-1">{token}</p>
                <button
                  type="button"
                  onClick={copyToken}
                  className="ui-button-ghost px-3 py-2 text-xs shrink-0"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-white/50">
                No camera handy? Paste the token above plus this server URL manually:{" "}
                <span className="font-mono">{apiBase}</span>
              </p>
            </div>
          </div>
          <p className="text-xs text-white/50">Sync endpoint: <span className="font-mono">{syncUrl}</span></p>
        </div>
      )}
    </div>
  );
}

function TwoFactorSection({ user, setUser }) {
  // "setup" state (secret/otpauthUri) only exists locally between calling
  // /2fa/setup and confirming with /2fa/verify -- if the user never
  // completes it, the server-side pending secret just sits unused (it can't
  // enable 2FA on its own, see server/src/modules/auth/routes.js).
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState(null);
  const [showDisable, setShowDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startSetup() {
    setError("");
    setBusy(true);
    try {
      const data = await apiFetch("/api/auth/2fa/setup", { method: "POST" });
      setSetup(data);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await apiFetch("/api/auth/2fa/verify", {
        method: "POST",
        body: JSON.stringify({ token: code }),
      });
      setBackupCodes(data.backupCodes);
      setUser((prev) => ({ ...prev, twoFactorEnabled: true }));
      setSetup(null);
      setCode("");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiFetch("/api/auth/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ password: disablePassword }),
      });
      setUser((prev) => ({ ...prev, twoFactorEnabled: false }));
      setShowDisable(false);
      setDisablePassword("");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">
            {user?.twoFactorEnabled ? "Enabled" : "Not enabled"}
          </p>
          <p className="text-xs text-white/70 mt-1 max-w-md">
            {user?.twoFactorEnabled
              ? "Logging in also requires a code from your authenticator app."
              : "Add an authenticator app code as a second step at login."}
          </p>
        </div>
        {user?.twoFactorEnabled && !showDisable && (
          <button
            type="button"
            onClick={() => setShowDisable(true)}
            className="ui-button-danger px-4 py-2.5 min-h-11 text-sm"
          >
            Disable
          </button>
        )}
        {!user?.twoFactorEnabled && !setup && !backupCodes && (
          <button
            type="button"
            onClick={startSetup}
            disabled={busy}
            className="ui-button-ghost px-4 py-2.5 min-h-11 text-sm disabled:opacity-60"
          >
            {busy ? "Starting..." : "Enable"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-300 mt-2">{error}</p>}

      {setup && (
        <form onSubmit={confirmSetup} className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <p className="text-xs text-white/70">
            Scan this into your authenticator app (Google Authenticator, Authy, 1Password, etc.), or enter the key
            manually:
          </p>
          <p className="text-xs font-mono break-all bg-black/30 rounded-lg p-2">{setup.secret}</p>
          <input
            className="ui-input"
            placeholder="Enter the 6-digit code to confirm"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <div className="flex gap-2">
            <button className="px-4 py-2.5 min-h-11 rounded-xl ui-button-primary text-sm" disabled={busy}>
              {busy ? "Confirming..." : "Confirm"}
            </button>
            <button
              type="button"
              className="text-xs text-white/70 hover:text-white"
              onClick={() => { setSetup(null); setCode(""); setError(""); }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {backupCodes && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <p className="text-xs text-white/70">
            Save these backup codes somewhere safe. Each one can be used once to sign in if you lose access to your
            authenticator app. They won't be shown again.
          </p>
          <div className="grid grid-cols-2 gap-1 text-xs font-mono bg-black/30 rounded-lg p-2">
            {backupCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <button
            type="button"
            className="ui-button-ghost px-4 py-2.5 min-h-11 text-sm"
            onClick={() => setBackupCodes(null)}
          >
            I've saved these codes
          </button>
        </div>
      )}

      {showDisable && (
        <form onSubmit={handleDisable} className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <p className="text-xs text-white/70">Enter your password to disable two-factor authentication.</p>
          <PasswordInput
            placeholder="Password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            required
          />
          <div className="flex gap-2">
            <button
              className="ui-button-danger px-4 py-2.5 min-h-11 text-sm"
              disabled={busy}
            >
              {busy ? "Disabling..." : "Confirm disable"}
            </button>
            <button
              type="button"
              className="text-xs text-white/70 hover:text-white"
              onClick={() => { setShowDisable(false); setDisablePassword(""); setError(""); }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// A literal <input type="range"> painted with a rainbow gradient track (see
// .hue-slider in index.css) instead of a native color-swatch popup -- still
// reaches the full hue spectrum, just dragged rather than picked from a
// palette. saturation/lightness are fixed per slider (passed in) so "dark"
// stays dark and "light" stays light regardless of which hue is chosen.
function HueSlider({ label, detail, hue, saturation, lightness, defaultHue, onChange }) {
  const swatch = hslToHex(hue, saturation, lightness);
  return (
    <div className="surface p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-white/60 mt-0.5">{detail}</p>
        </div>
        {hue !== defaultHue && (
          <button
            type="button"
            onClick={() => onChange(defaultHue)}
            className="ui-button-ghost px-2.5 py-1.5 text-xs shrink-0"
          >
            Reset
          </button>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={360}
          value={hue}
          onChange={(e) => onChange(Number(e.target.value))}
          className="hue-slider flex-1"
          style={{ "--thumb-color": swatch }}
          aria-label={label}
        />
        <span
          className="w-7 h-7 rounded-full border border-white/25 shrink-0"
          style={{ background: swatch }}
        />
      </div>
    </div>
  );
}

function SelectOption({ title, detail, value, onChange }) {
  return (
    <div className="surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-[0.8rem] bg-[#101814]/90 border border-white/15 px-3 py-1.5 text-xs outline-none focus:border-[#c5d7a6]"
        >
          <option value="midnight">Midnight</option>
          <option value="daylight">Daylight</option>
        </select>
      </div>
      <p className="text-xs text-white/70 mt-2">{detail}</p>
    </div>
  );
}
