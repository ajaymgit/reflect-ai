// Single source of truth for "read the saved theme/customization out of
// localStorage and apply it to the DOM." Previously this logic only lived
// inside SettingsPage.jsx's effects, which meant every override
// (--user-dark/--user-light/--paper-raised/--paper-sunken) only ever got
// applied while the Settings page itself was mounted -- loading any other
// route directly (a hard refresh on /dashboard, opening a new tab to
// /journal/new, etc.) rendered with the theme's own default colors even
// though a customization was saved, because nothing outside Settings ever
// read localStorage and set the CSS variables. Confirmed live: saved a
// custom Surface color, then navigated straight to /dashboard -- the hero
// card stayed the theme's uncustomized brown.
//
// AppShell.jsx and App.jsx both need to apply the saved theme mode (see
// their own comments on why -- pages inside vs. outside the authenticated
// route tree), and now both call applyStoredTheme() instead of duplicating
// a data-theme-mode-only version of this. SettingsPage.jsx keeps its own
// effects too, driven by live React state rather than a localStorage
// round-trip, so dragging a slider updates the page instantly instead of
// waiting on the persistence effect -- this file's DEFAULT_*/hslTo*
// exports are the single implementation both places share, so the two
// can't quietly drift out of sync.

export const DEFAULT_DARK_HUE = 43;
export const DEFAULT_LIGHT_HUE = 233;
export const DEFAULT_SURFACE_HUE = 43;

export const VALID_THEME_MODES = new Set(["midnight", "daylight", "organic-light", "organic-dark"]);

function isDarkThemeFamily(themeMode) {
  return themeMode === "midnight" || themeMode === "organic-dark";
}

// Saturation/lightness for the Surface slider (--paper-raised/--paper-sunken),
// relative to the active theme's own light/dark family instead of one fixed
// pale value. A single fixed near-white lightness (the original version:
// s25/l97 for every theme) produced two real problems, not just a taste
// preference: on Midnight/Organic Dark, where --ink is a light color, a
// near-white card meant near-illegible light-on-light text -- and even on
// light themes it read as "barely tinted white," not "the color the user
// actually picked." Branching on family means light themes get a light,
// clearly-colored card (dark ink stays legible) and dark themes get a dark,
// clearly-colored card (light ink stays legible) -- same shape as how the
// theme presets themselves handle it (every theme's own --paper-raised stays
// in its family: Daylight's is near-white, Midnight's is near-black, just a
// step off --paper each way), just with much bolder saturation than the
// presets use so the chosen hue is unmistakable rather than a faint wash.
export function surfaceTone(themeMode) {
  return isDarkThemeFamily(themeMode)
    ? { raised: { s: 55, l: 22 }, sunken: { s: 55, l: 13 } }
    : { raised: { s: 60, l: 90 }, sunken: { s: 60, l: 80 } };
}

// h: 0-360, s/l: 0-100. Plain HSL->hex, no library needed for one conversion.
export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n) => Math.round(255 * f(n)).toString(16).padStart(2, "0");
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

// Same math as hslToHex, but returns "R G B" (space-separated, no #) -- the
// format --paper-raised/--paper-sunken are already declared in (index.css),
// which is what lets Tailwind's `bg-paper-raised` etc. `<alpha-value>`
// opacity modifier work. hslToHex's hex string can't be dropped into that
// format, so this is a separate conversion, not a wrapper around it.
export function hslToRgbTriplet(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toChannel = (n) => Math.round(255 * f(n));
  return `${toChannel(0)} ${toChannel(8)} ${toChannel(4)}`;
}

// Reads equoria-settings once and applies everything it describes: the
// theme mode attribute (data-theme-mode, read by every body[data-theme-mode]
// block in index.css) plus each of the three independent hue overrides, if
// and only if that specific one was ever saved (typeof === "number" -- see
// hasStoredHue()'s comment in SettingsPage.jsx for why "was a value
// actually saved" and "loadSettings()'s merged-with-defaults result" are
// deliberately different checks). Safe to call on every route mount/change:
// it's a handful of property reads and DOM writes, not a fetch.
export function applyStoredTheme() {
  let settings = null;
  try {
    const raw = localStorage.getItem("equoria-settings");
    settings = raw ? JSON.parse(raw) : null;
  } catch {
    settings = null;
  }

  const themeMode = VALID_THEME_MODES.has(settings?.themeMode) ? settings.themeMode : "daylight";
  document.body.setAttribute("data-theme-mode", themeMode);

  const root = document.documentElement;
  const body = document.body;

  if (typeof settings?.darkHue === "number") {
    root.style.setProperty("--user-dark", hslToHex(settings.darkHue, 45, 92));
  } else {
    root.style.removeProperty("--user-dark");
  }

  if (typeof settings?.lightHue === "number") {
    root.style.setProperty("--user-light", hslToHex(settings.lightHue, 62, 53));
    root.style.setProperty("--user-light-soft", hslToHex(settings.lightHue, 67, 73));
    root.style.setProperty("--user-light-glow", `hsla(${settings.lightHue}, 62%, 53%, 0.28)`);
  } else {
    root.style.removeProperty("--user-light");
    root.style.removeProperty("--user-light-soft");
    root.style.removeProperty("--user-light-glow");
  }

  // On body, not root -- see the surfaceHue effect in SettingsPage.jsx for
  // why an override on <html> can't win here (body[data-theme-mode="x"]
  // declares --paper-raised/--paper-sunken directly on body itself, which
  // always beats a value merely inherited from html).
  if (typeof settings?.surfaceHue === "number") {
    const tone = surfaceTone(themeMode);
    body.style.setProperty("--paper-raised", hslToRgbTriplet(settings.surfaceHue, tone.raised.s, tone.raised.l));
    body.style.setProperty("--paper-sunken", hslToRgbTriplet(settings.surfaceHue, tone.sunken.s, tone.sunken.l));
  } else {
    body.style.removeProperty("--paper-raised");
    body.style.removeProperty("--paper-sunken");
  }
}
