import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Download, HeartPulse, LogOut, Palette, ShieldCheck, UserRound } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { apiFetch, describeError } from "../api";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";
import {
  DEFAULT_DARK_HUE,
  DEFAULT_LIGHT_HUE,
  DEFAULT_SURFACE_HUE,
  hslToHex,
  hslToRgbTriplet,
  surfaceTone,
  darkColorTone,
  lightColorTone,
} from "../utils/theme";

// Same stagger/entrance pattern the other main pages use -- Settings was
// one of the last three destinations (with JournalHistory and More) still
// rendering with a hard instant cut instead of a fade-and-rise entrance.
const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};
const staticContainerVariants = { hidden: {}, visible: {} };
const staticItemVariants = { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } };

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
        <Icon size={15} className="text-ink/50" />
        <p className="ui-kicker">{title}</p>
      </div>
      {children}
    </div>
  );
}

// Hue (0-360) defaults and the hex/rgb-triplet conversions now live in
// utils/theme.js (imported above) -- shared with applyStoredTheme(), which
// AppShell.jsx/App.jsx call on every route mount so a saved customization
// still renders on pages Settings never touched. Keeping one implementation
// means dragging a slider here and loading a fresh page elsewhere can never
// quietly disagree on what a given hue actually renders as.

const defaultSettings = {
  themeMode: "daylight",
  darkHue: DEFAULT_DARK_HUE,
  lightHue: DEFAULT_LIGHT_HUE,
  surfaceHue: DEFAULT_SURFACE_HUE,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem("equoria-settings");
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

// Separate from loadSettings() on purpose: that function always returns a
// numeric darkHue/lightHue (falling back to DEFAULT_DARK_HUE/LIGHT_HUE) so
// the sliders always have a value to render, even for someone who has never
// touched them. This one instead asks "did the user actually save THIS
// specific hue at some point" by checking the raw persisted JSON for that
// one key, not the merged-with-defaults result. That distinction is what the
// --user-dark / --user-light effects below need: each must only override the
// page background/accent for someone who deliberately customized THAT
// slider, never merely because the sliders happen to have *a* default
// position to display -- and never because the OTHER slider was touched.
// Takes the key ("darkHue" or "lightHue") instead of checking both at once:
// checking both together was the original bug -- dragging only the Light
// slider set the single shared flag to true, which then also applied
// --user-dark using whatever darkHue happened to be sitting in state
// (untouched, so still DEFAULT_DARK_HUE), silently overriding the active
// theme's background even though nobody asked to customize it.
function hasStoredHue(key) {
  try {
    const raw = localStorage.getItem("equoria-settings");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return typeof parsed[key] === "number";
  } catch {
    return false;
  }
}

export default function SettingsPage() {
  const reducedMotion = usePrefersReducedMotion();
  const cVariants = reducedMotion ? staticContainerVariants : containerVariants;
  const iVariants = reducedMotion ? staticItemVariants : itemVariants;
  // Reading localStorage in the lazy useState initializer (rather than in a
  // separate mount effect that calls setSettings after the fact) means
  // `settings` is correct from the very first render -- no
  // default-then-loaded double-render, which matters below: the veil effect
  // needs to see the REAL saved theme on its first run, not "daylight"
  // followed immediately by a spurious "loaded value" transition that would
  // otherwise trigger a jarring veil flash on every page load for anyone
  // whose saved theme isn't the default.
  const [settings, setSettings] = useState(loadSettings);
  // Was previously a single shared `hasCustomTheme` flag -- the effect below
  // just set --user-dark/--user-light together the instant EITHER slider was
  // touched, using DEFAULT_DARK_HUE/DEFAULT_LIGHT_HUE for whichever one
  // hadn't been. That silently pinned the whole app's background to a fixed
  // pale-ivory shade (hslToHex(43, 45, 92)) the moment someone dragged only
  // the Light color slider, overriding body[data-theme-mode="midnight"]'s
  // (or Organic dark's) dark palette everywhere for the rest of the browser
  // session -- confirmed live: on Midnight, touching only Light color left
  // the whole app washed out light with dark-tuned text illegible against
  // it. Two independent flags mean each slider's override applies (and
  // resets) on its own.
  const [hasCustomDarkHue, setHasCustomDarkHue] = useState(() => hasStoredHue("darkHue"));
  const [hasCustomLightHue, setHasCustomLightHue] = useState(() => hasStoredHue("lightHue"));
  const [hasCustomSurfaceHue, setHasCustomSurfaceHue] = useState(() => hasStoredHue("surfaceHue"));
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
    // Was `JSON.stringify(settings)` unconditionally -- that always wrote
    // darkHue/lightHue to disk (using their DEFAULT_* values if untouched),
    // which is exactly what made hasStoredHue() true for every account
    // forever after their very first visit to this page, defeating the fix
    // above the moment it looked at persisted data instead of live state.
    // Only persist each hue key once IT specifically is a real, user-made
    // override -- independently of the other one -- so e.g. saving after
    // only the Light slider was touched writes lightHue but omits darkHue
    // entirely, leaving hasStoredHue("darkHue") false on reload. themeMode
    // (light/dark mode itself, as opposed to the custom accent hues) is a
    // deliberate choice the instant it's touched, so it always persists.
    const { darkHue, lightHue, surfaceHue, ...rest } = settings;
    const toSave = { ...rest };
    if (hasCustomDarkHue) toSave.darkHue = darkHue;
    if (hasCustomLightHue) toSave.lightHue = lightHue;
    if (hasCustomSurfaceHue) toSave.surfaceHue = surfaceHue;
    localStorage.setItem("equoria-settings", JSON.stringify(toSave));
  }, [settings, hasCustomDarkHue, hasCustomLightHue, hasCustomSurfaceHue]);

  // Sets on <html> (not <body>) so the vars are visible to every stylesheet
  // rule regardless of specificity/ordering. Each slider only stores a hue
  // (0-360); saturation/lightness are fixed per role so "dark" always comes
  // out dark and "light" always comes out light no matter what hue is
  // picked -- index.css reads these via var(--user-dark, <original>) /
  // var(--user-light, <original>) etc, so as long as this effect has run
  // once (it always has, since darkHue/lightHue are never null) the sliders'
  // current position is exactly what's rendered everywhere.
  // Split into two independent effects (one per slider) instead of one
  // effect gated on a single shared flag -- each now only touches the CSS
  // variables it owns, so customizing Light color can never write
  // --user-dark (and vice versa).
  // s/l now come from darkColorTone(themeMode) instead of a fixed 45/92 --
  // that fixed pale value was tuned for light themes only (it's literally
  // Daylight's own paper lightness), so customizing Dark color on Daylight
  // then switching to Midnight/Organic Dark left the page background
  // pinned pale-light while the (already theme-aware, via surfaceTone)
  // cards correctly went dark -- a jarring, actually-broken-looking
  // mismatch. Depending on settings.themeMode means switching Theme mode
  // while a custom Dark color is active recomputes the right family, same
  // as the Surface color effect below already does.
  useEffect(() => {
    const root = document.documentElement;
    if (!hasCustomDarkHue) {
      // Nothing saved for this slider -- make sure no stale override from
      // earlier in this tab's session lingers, so CSS's own
      // var(--user-dark, rgb(var(--paper))) fallback (the correct,
      // theme-mode-aware color) takes over.
      root.style.removeProperty("--user-dark");
      return;
    }
    const tone = darkColorTone(settings.themeMode);
    root.style.setProperty("--user-dark", hslToHex(settings.darkHue, tone.s, tone.l));
  }, [settings.darkHue, settings.themeMode, hasCustomDarkHue]);

  // Same fix, for the accent/button color -- a fixed l:53 accent reads dim
  // against a dark background, which is exactly why each dark theme PRESET
  // already brightens its own --signal relative to its light counterpart
  // (see the comment on lightColorTone() in utils/theme.js).
  useEffect(() => {
    const root = document.documentElement;
    if (!hasCustomLightHue) {
      root.style.removeProperty("--user-light");
      root.style.removeProperty("--user-light-soft");
      root.style.removeProperty("--user-light-glow");
      return;
    }
    const tone = lightColorTone(settings.themeMode);
    const softL = Math.min(95, tone.l + 20);
    root.style.setProperty("--user-light", hslToHex(settings.lightHue, tone.s, tone.l));
    root.style.setProperty("--user-light-soft", hslToHex(settings.lightHue, tone.s, softL));
    root.style.setProperty("--user-light-glow", `hsla(${settings.lightHue}, ${tone.s}%, ${tone.l}%, 0.28)`);
  }, [settings.lightHue, settings.themeMode, hasCustomLightHue]);

  // Cards and the sidebar ("the brown part") read --paper-raised/
  // --paper-sunken directly -- via `rgb(var(--paper-raised))` in index.css
  // AND via Tailwind's `bg-paper-raised`/`bg-paper-sunken` classes used
  // straight in JSX (AppShell's <aside>, mobile nav, etc) -- neither route
  // has a var(--user-x, ...) fallback the way body's background does, so
  // there's no separate --user-surface variable to introduce here. Instead
  // this overrides --paper-raised/--paper-sunken themselves, in the same
  // RGB-triplet format index.css already declares them in, which every
  // existing consumer (both the raw CSS and the Tailwind classes) already
  // reads with zero changes needed elsewhere.
  //
  // Set on document.BODY, not document.documentElement like the two effects
  // above -- deliberately different. --paper-raised/--paper-sunken are
  // declared by body[data-theme-mode="midnight"] (etc) selectors, which
  // target the body element directly; a value declared directly on an
  // element always wins over one merely inherited from an ancestor,
  // regardless of the ancestor's specificity. So an override on <html>
  // would lose to Midnight's/Organic's own body-level values every time.
  // Only a declaration on body itself -- and inline style is the highest
  // form of that -- can actually win.
  //
  // Saturation/lightness come from surfaceTone(themeMode) (utils/theme.js),
  // not a fixed pair -- a single fixed near-white value made cards
  // near-illegible on Midnight/Organic Dark (light ink text over a
  // near-white card) and looked like a faint wash rather than the color
  // actually picked even on light themes. Depending on settings.themeMode
  // also means switching the Theme mode dropdown while a custom Surface
  // color is active recomputes the right light/dark family instead of
  // leaving a light-family tone applied on a dark theme.
  useEffect(() => {
    const body = document.body;
    if (!hasCustomSurfaceHue) {
      body.style.removeProperty("--paper-raised");
      body.style.removeProperty("--paper-sunken");
      return;
    }
    const tone = surfaceTone(settings.themeMode);
    body.style.setProperty("--paper-raised", hslToRgbTriplet(settings.surfaceHue, tone.raised.s, tone.raised.l));
    body.style.setProperty("--paper-sunken", hslToRgbTriplet(settings.surfaceHue, tone.sunken.s, tone.sunken.l));
  }, [settings.surfaceHue, settings.themeMode, hasCustomSurfaceHue]);

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

  // Drive each slider's own swatch/track colors and the preview card below
  // -- same tones the applied CSS overrides actually use (see
  // darkColorTone()/lightColorTone()/surfaceTone()'s comments in
  // utils/theme.js), so what's shown here never disagrees with what
  // dragging the slider actually produces, and updates immediately if
  // Theme mode is switched.
  const darkTone = darkColorTone(settings.themeMode);
  const lightTone = lightColorTone(settings.themeMode);
  const surfaceRaisedTone = surfaceTone(settings.themeMode).raised;

  return (
    <main className="ui-page">
      <motion.div variants={cVariants} initial="hidden" animate="visible" className="max-w-5xl mx-auto space-y-4">
        <motion.div variants={iVariants} className="ui-card rounded-2xl p-5">
          <p className="ui-kicker">Settings</p>
          <h2 className="ui-title mt-1">Preferences</h2>
        </motion.div>

        {/* Two columns on desktop instead of one long vertical stack --
            matching the card-grid pattern Dashboard already uses for its
            Health/Retrospect preview row, so each section reads as its own
            card rather than one more box in an undifferentiated list. */}
        <div className="grid md:grid-cols-2 gap-4 items-start">
          <motion.div variants={iVariants} className="space-y-4">
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
                  saturation={darkTone.s}
                  lightness={darkTone.l}
                  defaultHue={DEFAULT_DARK_HUE}
                  onChange={(hue) => {
                    setHasCustomDarkHue(true);
                    setSettings((prev) => ({ ...prev, darkHue: hue }));
                  }}
                  onReset={() => {
                    // Clears the override entirely (not just resets the
                    // slider position) so the active theme's own background
                    // takes back over via CSS's var(--user-dark, ...)
                    // fallback -- previously this called onChange(defaultHue)
                    // too, which left hasCustomTheme (and thus the override)
                    // permanently on, just pinned to a color that happened
                    // to match Daylight and nothing else.
                    setHasCustomDarkHue(false);
                    setSettings((prev) => ({ ...prev, darkHue: DEFAULT_DARK_HUE }));
                  }}
                />
                <HueSlider
                  label="Light color"
                  detail="Buttons and highlight accents."
                  hue={settings.lightHue}
                  saturation={lightTone.s}
                  lightness={lightTone.l}
                  defaultHue={DEFAULT_LIGHT_HUE}
                  onChange={(hue) => {
                    setHasCustomLightHue(true);
                    setSettings((prev) => ({ ...prev, lightHue: hue }));
                  }}
                  onReset={() => {
                    setHasCustomLightHue(false);
                    setSettings((prev) => ({ ...prev, lightHue: DEFAULT_LIGHT_HUE }));
                  }}
                />
                <div className="sm:col-span-2">
                  <HueSlider
                    label="Surface color"
                    detail="Cards, sidebar, and panels."
                    hue={settings.surfaceHue}
                    saturation={surfaceRaisedTone.s}
                    lightness={surfaceRaisedTone.l}
                    defaultHue={DEFAULT_SURFACE_HUE}
                    onChange={(hue) => {
                      setHasCustomSurfaceHue(true);
                      setSettings((prev) => ({ ...prev, surfaceHue: hue }));
                    }}
                    onReset={() => {
                      setHasCustomSurfaceHue(false);
                      setSettings((prev) => ({ ...prev, surfaceHue: DEFAULT_SURFACE_HUE }));
                    }}
                  />
                </div>
              </div>
              <AppearancePreview
                darkHue={settings.darkHue}
                darkToneValue={darkTone}
                lightHue={settings.lightHue}
                lightToneValue={lightTone}
                surfaceHue={settings.surfaceHue}
                surfaceToneValue={surfaceRaisedTone}
              />
              <p className="text-xs text-ink/50 mt-2">Applies instantly across the whole app.</p>
            </SectionCard>

            <SectionCard icon={UserRound} title="Account">
              {/* No inner .surface box here -- previously this single info
                  block sat in its own bordered box nested inside the
                  SectionCard's own border, a card-in-a-card for content that
                  never needed the extra separation. */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-ink/50 uppercase tracking-wide">Name</p>
                  <p className="text-sm mt-1">{user?.name || "--"}</p>
                </div>
                <div>
                  <p className="text-xs text-ink/50 uppercase tracking-wide">Email</p>
                  <p className="text-sm mt-1">{user?.email || "--"}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard icon={Bell} title="Reminders">
              <ReminderSection user={user} setUser={setUser} />
              <WeeklyDigestSection user={user} setUser={setUser} />
            </SectionCard>
          </motion.div>

          <motion.div variants={iVariants} className="space-y-4">
            <SectionCard icon={LogOut} title="Security">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium">Log out everywhere</p>
                  <p className="text-xs text-ink/70 mt-1 max-w-md">
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
          </motion.div>
        </div>

        <motion.p variants={iVariants} className="text-xs text-ink/50 text-center pt-2">
          <Link to="/privacy" className="underline hover:text-ink/75">
            Privacy Policy
          </Link>
          <span className="mx-2">·</span>
          <Link to="/terms" className="underline hover:text-ink/75">
            Terms of Service
          </Link>
        </motion.p>
      </motion.div>
    </main>
  );
}

// Small mockup card painted with the two colors the sliders above actually
// control -- computed directly from the live hue state (not the CSS custom
// properties, which only update once the settings-change effect runs),
// so dragging a slider updates this preview in the same render.
function AppearancePreview({ darkHue, darkToneValue, lightHue, lightToneValue, surfaceHue, surfaceToneValue }) {
  const bg = hslToHex(darkHue, darkToneValue.s, darkToneValue.l);
  const light = hslToHex(lightHue, lightToneValue.s, lightToneValue.l);
  // Same saturation/lightness (passed down from surfaceTone(themeMode) in
  // the parent -- renamed to surfaceToneValue here so it doesn't shadow the
  // surfaceTone() function name) as the live --paper-raised override, so
  // this swatch matches what the Surface slider will actually produce, not
  // an approximation of it -- including which theme family's tone it's using.
  const surface = hslToHex(surfaceHue, surfaceToneValue.s, surfaceToneValue.l);
  return (
    <div className="mt-3 rounded-xl p-3 border border-ink/10" style={{ background: bg }}>
      <div className="rounded-lg p-2 border border-ink/10" style={{ background: surface }}>
        <p className="text-[10px] uppercase tracking-wide" style={{ color: light, fontFamily: '"JetBrains Mono", monospace' }}>
          Preview
        </p>
        <button
          type="button"
          tabIndex={-1}
          className="mt-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold pointer-events-none"
          style={{ background: light, color: "#FFFFFF" }}
        >
          Button
        </button>
      </div>
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
  // Two independent busy flags -- previously a single shared `busy` would
  // disable BOTH buttons the moment either download started, which reads as
  // "the whole export feature is doing something" when really only one of
  // two genuinely separate requests is in flight.
  const [busyAll, setBusyAll] = useState(false);
  const [busyCsv, setBusyCsv] = useState(false);
  const [busyKeepsakes, setBusyKeepsakes] = useState(false);
  const [error, setError] = useState("");

  // Shared by both downloads -- fetched manually (not via the shared
  // apiFetch helper) since that helper always calls res.json() and returns
  // parsed data; this needs the raw response as a Blob so the browser can
  // trigger an actual file download via a temporary object URL.
  async function downloadFile(path, filename, setBusy) {
    setBusy(true);
    setError("");
    try {
      const apiBase = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const token = localStorage.getItem("reflectai_token");
      const res = await fetch(`${apiBase}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed. Please try again.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
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

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">Export your data</p>
          <p className="text-xs text-ink/70 mt-1 max-w-md">
            Download every journal entry, health reading, retrospect analysis, and chat message as one JSON file.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadFile("/api/export/all", `reflectai-export-${today}.json`, setBusyAll)}
          disabled={busyAll}
          className="ui-button-ghost px-4 py-2.5 min-h-11 text-sm disabled:opacity-60"
        >
          {busyAll ? "Preparing..." : "Download my data"}
        </button>
      </div>
      {/* CSV of just the journal entries -- a raw JSON blob isn't something
          most people can actually open and skim; a spreadsheet-importable
          CSV of the entries themselves (the data someone doing "let me look
          back through what I wrote" actually wants) is a friendlier second
          option, not a replacement for the complete structured export above. */}
      <div className="flex items-center justify-between gap-3 flex-wrap mt-3 pt-3 border-t border-ink/10">
        <div>
          <p className="text-sm font-medium">Journal entries as a spreadsheet</p>
          <p className="text-xs text-ink/70 mt-1 max-w-md">
            Just your entries -- date, title, mood, tags, and content -- as a CSV you can open directly in Excel,
            Numbers, or Sheets.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadFile("/api/export/journal.csv", `reflectai-journal-${today}.csv`, setBusyCsv)}
          disabled={busyCsv}
          className="ui-button-ghost px-4 py-2.5 min-h-11 text-sm disabled:opacity-60"
        >
          {busyCsv ? "Preparing..." : "Download as CSV"}
        </button>
      </div>
      {/* Just the entries someone chose to flag as a Keepsake -- a smaller,
          curated export distinct from "everything" above, the CSV
          counterpart to the archive page's new Keepsakes-only filter. */}
      <div className="flex items-center justify-between gap-3 flex-wrap mt-3 pt-3 border-t border-ink/10">
        <div>
          <p className="text-sm font-medium">Just your Keepsakes</p>
          <p className="text-xs text-ink/70 mt-1 max-w-md">
            Only the entries you flagged as a Keepsake, as the same date/title/mood/tags/content CSV.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadFile("/api/export/keepsakes.csv", `reflectai-keepsakes-${today}.csv`, setBusyKeepsakes)}
          disabled={busyKeepsakes}
          className="ui-button-ghost px-4 py-2.5 min-h-11 text-sm disabled:opacity-60"
        >
          {busyKeepsakes ? "Preparing..." : "Download as CSV"}
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
          <p className="text-xs text-ink/70 mt-1 max-w-md">
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
          <span className="text-xs text-ink/70">{enabled ? "On" : "Off"}</span>
        </label>
      </div>

      {enabled && (
        <div className="mt-3 flex items-center gap-3 border-t border-ink/10 pt-3">
          <p className="text-xs text-ink/70">Remind me around</p>
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
            // to every real .ui-input field elsewhere in the app. The
            // outline-none is paired with a real focus ring (like
            // .ui-input:focus's box-shadow) rather than a border-color
            // change alone -- a 1px border tint is too subtle a focus
            // signal on its own.
            className="rounded-[0.8rem] bg-paper-sunken/90 border border-ink/15 px-3 py-1.5 text-xs outline-none focus:border-ember-soft focus:ring-2 focus:ring-ember-soft/30"
          >
            {Array.from({ length: 24 }).map((_, h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </select>
          {busy && <span className="text-xs text-ink/50">Saving...</span>}
          <AnimatePresence>
            {saved && !busy && (
              <motion.span
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="text-xs text-emerald-300"
              >
                Saved
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}
      {error && <p className="text-xs text-red-300 mt-2">{error}</p>}
    </div>
  );
}

// Sibling to ReminderSection above -- a separate opt-IN toggle (default
// off, unlike the reminder's default-on) for a once-a-week recap email
// (entries written, streak, dominant mood, health averages), backed by
// PATCH /api/auth/digest-preferences and server/src/scripts/sendWeeklyDigest.js.
// Kept as its own component/endpoint rather than folded into
// ReminderSection: different cadence, different default, genuinely
// different concern (a recap vs a same-day nudge).
function WeeklyDigestSection({ user, setUser }) {
  const [enabled, setEnabled] = useState(user?.weeklyDigestEnabled ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEnabled(user?.weeklyDigestEnabled ?? false);
  }, [user?.weeklyDigestEnabled]);

  async function save(nextEnabled) {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const data = await apiFetch("/api/auth/digest-preferences", {
        method: "PATCH",
        body: JSON.stringify({ enabled: nextEnabled }),
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
          <p className="text-sm font-medium">Weekly digest</p>
          <p className="text-xs text-ink/70 mt-1 max-w-md">
            A once-a-week email recap: entries written, your streak, dominant mood, and health averages.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              const next = e.target.checked;
              setEnabled(next);
              save(next);
            }}
            className="w-4 h-4"
          />
          <span className="text-xs text-ink/70">{enabled ? "On" : "Off"}</span>
        </label>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {busy && <span className="text-xs text-ink/50">Saving...</span>}
        <AnimatePresence>
          {saved && !busy && (
            <motion.span
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="text-xs text-emerald-300"
            >
              Saved
            </motion.span>
          )}
        </AnimatePresence>
      </div>
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
          <p className="text-xs text-ink/70 mt-1 max-w-md">
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
        <div className="mt-3 space-y-3 border-t border-ink/10 pt-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            {qrDataUrl && (
              <div className="shrink-0 rounded-xl overflow-hidden border border-ink/15 bg-white p-2">
                <img src={qrDataUrl} alt="QR code with server URL and sync token" width={140} height={140} />
              </div>
            )}
            <div className="flex-1 space-y-2 min-w-0">
              <p className="text-xs text-ink/70">
                In the ReflectHealthSync app, tap "Scan QR Code" and point your camera at this -- it fills in the
                server URL and token for you. Won't be shown again after you leave this page.
              </p>
              <div className="flex items-center gap-2">
                <p className="text-xs font-mono break-all bg-paper-sunken rounded-lg p-2 flex-1">{token}</p>
                <button
                  type="button"
                  onClick={copyToken}
                  className="ui-button-ghost px-3 py-2 text-xs shrink-0 overflow-hidden"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={copied ? "copied" : "copy"}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="inline-block"
                    >
                      {copied ? "Copied" : "Copy"}
                    </motion.span>
                  </AnimatePresence>
                </button>
              </div>
              <p className="text-xs text-ink/50">
                No camera handy? Paste the token above plus this server URL manually:{" "}
                <span className="font-mono">{apiBase}</span>
              </p>
            </div>
          </div>
          <p className="text-xs text-ink/50">Sync endpoint: <span className="font-mono">{syncUrl}</span></p>
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
          <p className="text-xs text-ink/70 mt-1 max-w-md">
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
        <form onSubmit={confirmSetup} className="mt-3 space-y-2 border-t border-ink/10 pt-3">
          <p className="text-xs text-ink/70">
            Scan this into your authenticator app (Google Authenticator, Authy, 1Password, etc.), or enter the key
            manually:
          </p>
          <p className="text-xs font-mono break-all bg-paper-sunken rounded-lg p-2">{setup.secret}</p>
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
              className="text-xs text-ink/70 hover:text-ink"
              onClick={() => { setSetup(null); setCode(""); setError(""); }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {backupCodes && (
        <div className="mt-3 space-y-2 border-t border-ink/10 pt-3">
          <p className="text-xs text-ink/70">
            Save these backup codes somewhere safe. Each one can be used once to sign in if you lose access to your
            authenticator app. They won't be shown again.
          </p>
          <div className="grid grid-cols-2 gap-1 text-xs font-mono bg-paper-sunken rounded-lg p-2">
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
        <form onSubmit={handleDisable} className="mt-3 space-y-2 border-t border-ink/10 pt-3">
          <p className="text-xs text-ink/70">Enter your password to disable two-factor authentication.</p>
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
              className="text-xs text-ink/70 hover:text-ink"
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
function HueSlider({ label, detail, hue, saturation, lightness, defaultHue, onChange, onReset }) {
  const swatch = hslToHex(hue, saturation, lightness);
  return (
    <div className="surface p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-ink/60 mt-0.5">{detail}</p>
        </div>
        {hue !== defaultHue && (
          <button
            type="button"
            onClick={onReset}
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
          className="w-7 h-7 rounded-full border border-ink/25 shrink-0"
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
          className="rounded-[0.8rem] bg-paper-sunken/90 border border-ink/15 px-3 py-1.5 text-xs outline-none focus:border-ember-soft focus:ring-2 focus:ring-ember-soft/30"
        >
          <option value="midnight">Midnight</option>
          <option value="daylight">Daylight</option>
          <option value="organic-light">Organic (Light)</option>
          <option value="organic-dark">Organic (Dark)</option>
        </select>
      </div>
      <p className="text-xs text-ink/70 mt-2">{detail}</p>
    </div>
  );
}
