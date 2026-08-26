// The single most important number on a page, rendered at one consistent
// scale (.ui-hero-number, see index.css) instead of each page picking its
// own text-4xl/text-5xl/text-6xl ad hoc. `accent` swaps between the app's
// two fixed roles: "gold" for emphasis (the default -- most hero numbers are
// a highlight, not a call to action) or "clay" to match the primary
// accent/active-state color instead.
const ACCENT_CLASS = {
  gold: "text-accent-ember",
  clay: "text-signal",
  none: "",
};

export default function HeroNumber({ value, accent = "gold", size = "text-5xl", className = "", ...rest }) {
  return (
    <p className={`ui-hero-number ${size} ${ACCENT_CLASS[accent] || ""} ${className}`} {...rest}>
      {value}
    </p>
  );
}
