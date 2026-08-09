import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, describeError } from "../api";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput";

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
      <div className="max-w-4xl mx-auto ui-card rounded-2xl p-5">
        <p className="ui-kicker">Settings</p>
        <h2 className="ui-title mt-1">Preferences</h2>
        {/* Previously had 5 toggles here; 4 of them (reduced motion,
            notification sounds, privacy mode, focus mode) saved to
            localStorage but nothing else in the app ever read them -- they
            looked functional but did nothing. Removed rather than left as
            misleading UI; theme mode is the only one that actually works. */}
        <div className="mt-4 grid md:grid-cols-2 gap-3">
          <SelectOption
            title="Theme mode"
            detail="Switch instantly between bright and deep background modes."
            value={settings.themeMode}
            onChange={(value) => setSettings((prev) => ({ ...prev, themeMode: value }))}
          />
        </div>

        <div className="mt-6 pt-5 border-t border-white/10">
          <p className="ui-kicker">Appearance</p>
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
          <p className="text-xs text-white/50 mt-2">Applies instantly across the whole app.</p>
        </div>

        {/* Previously this page ended right after the theme selector --
            everything below it (Security) was in one thin card near the top
            with a large empty page beneath, the sparsest-looking screen in
            the app by a wide margin. Real account info (already available
            from the logged-in session, nothing new fetched) instead of
            padding with decorative or non-functional toggles. */}
        <div className="mt-6 pt-5 border-t border-white/10">
          <p className="ui-kicker">Account</p>
          <div className="mt-3 surface p-3 grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wide">Name</p>
              <p className="text-sm mt-1">{user?.name || "--"}</p>
            </div>
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wide">Email</p>
              <p className="text-sm mt-1">{user?.email || "--"}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-white/10">
          <p className="ui-kicker">Security</p>
          <div className="mt-3 surface p-3">
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
                className="px-4 py-2.5 min-h-11 rounded-xl border border-red-400/40 bg-red-500/10 hover:bg-red-500/20 text-red-200 text-sm font-medium disabled:opacity-60"
              >
                {loggingOut ? "Logging out..." : "Log out everywhere"}
              </button>
            </div>
            {logoutStatus && <p className="text-xs text-red-300 mt-2">{logoutStatus}</p>}
          </div>

          <TwoFactorSection user={user} setUser={setUser} />
        </div>

        <div className="mt-6 pt-5 border-t border-white/10">
          <p className="ui-kicker">Integrations</p>
          <AppleHealthSection />
        </div>
      </div>
    </main>
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
    <div className="mt-3 surface p-3">
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
          className="px-4 py-2.5 min-h-11 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium disabled:opacity-60"
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
                  className="px-3 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs shrink-0"
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
    <div className="mt-4 surface p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">Two-factor authentication</p>
          <p className="text-xs text-white/70 mt-1 max-w-md">
            {user?.twoFactorEnabled
              ? "Enabled -- logging in also requires a code from your authenticator app."
              : "Add an authenticator app code as a second step at login."}
          </p>
        </div>
        {user?.twoFactorEnabled && !showDisable && (
          <button
            type="button"
            onClick={() => setShowDisable(true)}
            className="px-4 py-2.5 min-h-11 rounded-xl border border-red-400/40 bg-red-500/10 hover:bg-red-500/20 text-red-200 text-sm font-medium"
          >
            Disable
          </button>
        )}
        {!user?.twoFactorEnabled && !setup && !backupCodes && (
          <button
            type="button"
            onClick={startSetup}
            disabled={busy}
            className="px-4 py-2.5 min-h-11 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium disabled:opacity-60"
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
            className="px-4 py-2.5 min-h-11 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium"
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
              className="px-4 py-2.5 min-h-11 rounded-xl border border-red-400/40 bg-red-500/10 hover:bg-red-500/20 text-red-200 text-sm font-medium"
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
            className="px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs shrink-0"
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
          className="rounded-lg bg-[#111827] border border-white/15 px-2 py-1 text-xs"
        >
          <option value="midnight">Midnight</option>
          <option value="daylight">Daylight</option>
        </select>
      </div>
      <p className="text-xs text-white/70 mt-2">{detail}</p>
    </div>
  );
}
