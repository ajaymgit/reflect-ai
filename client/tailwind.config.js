/** @type {import('tailwindcss').Config} */
// Full visual-identity rewrite: warm ivory paper base instead of near-black,
// an indigo "signal" primary accent + coral "ember" secondary instead of
// clay/gold, and a sharp/flat shape language (small radii, solid borders,
// no blur) instead of soft-rounded glass cards. This is a deliberate pivot
// away from every earlier pass this app has had -- those all kept the same
// dark base + warm-earth accent + soft-rounded-glass combination underneath
// whatever else changed, which is why they kept reading as "the same app."
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Every token here resolves through a CSS custom property (defined
        // in index.css's :root, RGB triplet form) instead of a flat hex --
        // that's what lets `body[data-theme-mode="midnight"]` swap the
        // whole palette to the dark-green theme by overriding ~9 variables
        // in one place, rather than needing a `dark:` variant on every
        // className in the app. The `<alpha-value>` placeholder is
        // Tailwind's own mechanism for keeping opacity modifiers working
        // on a var-based color (bg-paper/50, text-ink/70, etc. still work
        // exactly as before).
        paper: {
          DEFAULT: "rgb(var(--paper) / <alpha-value>)",
          raised: "rgb(var(--paper-raised) / <alpha-value>)",
          sunken: "rgb(var(--paper-sunken) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink) / 0.62)",
          faint: "rgb(var(--ink) / 0.4)",
        },
        // Primary accent -- cobalt/indigo "signal" in light mode, a
        // brighter periwinkle in midnight mode for contrast against a dark
        // green base. Also the fallback for --user-light (Settings ->
        // Appearance still lets someone override this with their own hue).
        signal: {
          DEFAULT: "rgb(var(--signal) / <alpha-value>)",
          soft: "rgb(var(--signal-soft) / <alpha-value>)",
          deep: "rgb(var(--signal-deep) / <alpha-value>)",
        },
        // Secondary accent -- coral "ember", reserved for emphasis (hero
        // numbers, the one finding on a page) so it never competes with
        // signal's job (actions, active nav, links).
        ember: {
          DEFAULT: "rgb(var(--ember) / <alpha-value>)",
          soft: "rgb(var(--ember-soft) / <alpha-value>)",
        },
      },
      fontFamily: {
        // Bold geometric display sans instead of a serif -- headlines read
        // as confident/structural rather than editorial/literary.
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SF Mono", "monospace"],
      },
      // Sharp, small radii -- corners read as precise/structural rather
      // than soft/pillowy. Hierarchy between "regular card" and "hero card"
      // now comes from a thick accent-colored left border, not a bigger
      // radius (see .ui-card-hero in index.css).
      borderRadius: {
        xs: "0.0625rem",
        sm: "0.125rem",
        md: "0.25rem",
        lg: "0.375rem",
        xl: "0.5rem",
        "2xl": "0.75rem",
      },
    },
  },
  plugins: [],
};
