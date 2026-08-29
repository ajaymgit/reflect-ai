import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Flame, HeartPulse, LineChart, Mail } from "lucide-react";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";

// The single biggest gap flagged in docs/ux-comparison-2026-08.md: Equoria
// had no public-facing marketing page at all -- the bare domain dropped a
// first-time visitor straight into a login form with zero context, while
// every competitor (Day One, Rosebud, Mindsera, Stoic, Reflectly, FutureMe)
// leads with a confident one-line pitch and a real look at the product. This
// is that front door. It reuses the app's actual design tokens (ui-card,
// ui-kicker, ui-button-primary, the mood palette, the "Reflect / Equoria"
// wordmark from AppShell.jsx) rather than inventing a separate marketing
// aesthetic -- so clicking through into the real app doesn't feel like a
// bait-and-switch, which was a real risk flagged in that same audit.
//
// The three feature "screenshots" below are faithful code recreations of
// the live Dashboard/Journal/Retrospect screens (same classes, same colors,
// same copy), not raster screenshots -- this sandbox has no reliable way to
// capture and ship a binary image asset into the repo, and a coded
// recreation stays pixel-crisp and automatically follows theme changes
// (Midnight, Organic) instead of going stale the next time those pages'
// copy changes. If real photography of the live app is wanted later, these
// three <BrowserFrame> blocks are exactly where an <img> would replace the
// JSX recreation -- the surrounding layout doesn't need to change.
const MOOD_SWATCHES = ["#E8AB5F", "#7A9E84", "#84689D", "#DA8B5B", "#C2574A", "#A989B2"];

function seededMood(i) {
  // Deterministic, not random -- a static decorative grid shouldn't reflow
  // or flash a different pattern on every re-render.
  return MOOD_SWATCHES[(i * 7 + 3) % MOOD_SWATCHES.length];
}

function MoodGrid({ cols = 12, rows = 6, className = "" }) {
  const cells = Array.from({ length: cols * rows });
  return (
    <div
      className={`grid gap-1.5 ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {cells.map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded-[2px]"
          style={{ background: seededMood(i), opacity: 0.5 + ((i * 13) % 5) * 0.09 }}
        />
      ))}
    </div>
  );
}

function BrowserFrame({ path, children }) {
  return (
    <div className="ui-card overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-ink/10 bg-paper-sunken px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        <span className="ui-mono text-[11px] text-ink/40 ml-2">equoria.app{path}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function MockDashboard() {
  return (
    <BrowserFrame path="/dashboard">
      <p className="ui-kicker">Welcome back, Demo User</p>
      <h3 className="ui-title mt-1 text-lg">How are you feeling today?</h3>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="surface p-2.5">
          <p className="ui-kicker text-[9px]">Streak</p>
          <p className="font-display text-2xl font-bold mt-1 flex items-center gap-1">
            12 <Flame className="h-4 w-4 text-accent-ember" />
          </p>
        </div>
        <div className="surface p-2.5 col-span-2">
          <p className="ui-kicker text-[9px]">This month</p>
          <MoodGrid cols={10} rows={2} className="mt-2" />
        </div>
      </div>
      <div className="ui-card-hero mt-3 p-2.5">
        <p className="text-xs text-ink/70">A letter you wrote 3 months ago has arrived.</p>
      </div>
    </BrowserFrame>
  );
}

function MockRetrospect() {
  const bars = [42, 68, 55, 80, 60, 90, 48];
  return (
    <BrowserFrame path="/retrospect">
      <p className="ui-kicker">Insights</p>
      <h3 className="ui-title mt-1 text-lg">Your patterns this month</h3>
      <div className="mt-4 flex items-end gap-2 h-24">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 ui-bar-track rounded-sm overflow-hidden flex items-end">
            <div
              className="w-full rounded-sm"
              style={{ height: `${h}%`, background: seededMood(i) }}
            />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink/50 mt-2">Mood trend, last 7 entries</p>
    </BrowserFrame>
  );
}

function MockCapsule() {
  return (
    <BrowserFrame path="/journal/new">
      <p className="ui-kicker">Letters to your future self</p>
      <h3 className="ui-title mt-1 text-lg">Sealed, opens Dec 31</h3>
      <div className="surface p-3 mt-3 flex items-start gap-2.5">
        <Mail className="h-4 w-4 text-signal mt-0.5 shrink-0" />
        <p className="text-xs text-ink/60 leading-5">
          This letter won't appear anywhere -- not even to you -- until it opens.
        </p>
      </div>
    </BrowserFrame>
  );
}

const showcaseRows = [
  {
    Icon: LineChart,
    kicker: "Insights",
    title: "Real patterns, not vibes",
    copy:
      "Retrospect finds what actually correlates with your mood over time -- recurring themes, weekday swings, the writing habits that show up on your best and hardest days. Not a generic mood tracker: it's reading your own words.",
    Mock: MockRetrospect,
    reverse: false,
  },
  {
    Icon: Mail,
    kicker: "Letters",
    title: "Seal a letter to your future self",
    copy:
      "Write something today that a future version of you needs to read. It won't appear anywhere -- not even to you -- until the date you chose. No one can peek early, including the person who wrote it.",
    Mock: MockCapsule,
    reverse: true,
  },
  {
    Icon: HeartPulse,
    kicker: "Health",
    title: "See how you actually feel, backed by data",
    copy:
      "Equoria connects the dots between how you write and how you're doing -- sleep, activity, stress -- so a hunch about a bad week becomes something you can actually see.",
    Mock: MockDashboard,
    reverse: false,
  },
];

export default function LandingPage() {
  const reducedMotion = usePrefersReducedMotion();
  const fadeUp = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-80px" },
        transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
      };

  return (
    <div className="min-h-screen page-gradient living-bg mood-calm text-ink">
      {/* ---- Nav ---- */}
      <header className="no-print sticky top-0 z-20 border-b border-ink/10 bg-paper-raised/95 backdrop-saturate-150">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3.5 flex items-center justify-between">
          <Link to="/welcome" className="flex items-center gap-2.5 hover:opacity-90 transition">
            <span className="h-2 w-2 rounded-full shrink-0 bg-accent-ember" />
            <div>
              <p className="text-lg font-semibold leading-none font-display">Reflect</p>
              <p className="ui-kicker text-ink-faint mt-0.5 text-[9px]">Equoria</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden sm:inline-flex px-4 py-2 min-h-10 ui-button-ghost text-sm">
              Log in
            </Link>
            <Link to="/register" className="inline-flex px-4 py-2 min-h-10 ui-button-primary text-sm">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ---- Hero: split, not centered -- see design-taste-frontend's
          anti-center-bias rule. Decorative mood grid sits behind the copy
          on desktop only (asymmetric weight), not as a boxed illustration --
          the app's own real mood palette standing in for a signature visual
          instead of stock photography or an AI-generated mascot. ---- */}
      <section className="max-w-6xl mx-auto px-4 md:px-6 pt-14 md:pt-20 pb-16 md:pb-24 grid md:grid-cols-2 gap-10 md:gap-8 items-center">
        <motion.div {...fadeUp}>
          <p className="ui-kicker">A journal that remembers</p>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] mt-3">
            Write to yourself.
            <br />
            Read it back <span className="text-signal">changed</span>.
          </h1>
          <p className="text-ink/70 mt-5 text-base md:text-lg leading-7 max-w-md">
            Equoria tracks real patterns in how you feel, remembers what mattered, and lets you seal
            letters to your future self -- sealed until the day they're meant to open.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-7">
            <Link to="/register" className="inline-flex items-center gap-2 px-6 py-3.5 min-h-12 ui-button-primary">
              Start journaling -- it's free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login" className="inline-flex sm:hidden px-6 py-3.5 min-h-12 ui-button-ghost">
              Log in
            </Link>
          </div>
          <p className="text-xs text-ink/50 mt-4">No credit card. Your entries stay private by default.</p>
        </motion.div>

        <motion.div
          className="relative"
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          <MoodGrid cols={9} rows={9} className="absolute -inset-6 -z-10 hidden md:grid opacity-40" />
          <MockDashboard />
        </motion.div>
      </section>

      {/* ---- Feature showcase: alternating rows, not three equal cards --
          each one is a real (recreated) screen, not an icon-plus-blurb
          tile. ---- */}
      <section className="max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-16 space-y-16 md:space-y-24">
        {showcaseRows.map(({ Icon, kicker, title, copy, Mock, reverse }, i) => (
          <motion.div
            key={kicker}
            {...fadeUp}
            className={`grid md:grid-cols-2 gap-8 md:gap-12 items-center ${
              reverse ? "md:[&>*:first-child]:order-2" : ""
            }`}
          >
            <div>
              <div className="inline-flex items-center gap-2 text-signal">
                <Icon className="h-4 w-4" />
                <p className="ui-kicker">{kicker}</p>
              </div>
              <h2 className="ui-title mt-2 text-2xl md:text-3xl">{title}</h2>
              <p className="text-ink/70 mt-3 leading-7">{copy}</p>
            </div>
            <Mock />
          </motion.div>
        ))}
      </section>

      {/* ---- Proof section: no testimonials exist yet, so this shows a
          concrete example of the product's own output instead of a vague
          claim -- an editorial pull-quote in the same voice Retrospect
          actually generates. ---- */}
      <section className="max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <motion.div {...fadeUp}>
          <p className="ui-kicker text-center">What Equoria notices</p>
          <div className="ui-quote mt-6 mx-auto max-w-xl">
            <p className="ui-quote-text text-xl md:text-2xl">
              You write 40% more on days you tag as calm -- and those entries mention sleep three
              times as often as any other mood.
            </p>
          </div>
          <p className="text-center text-xs text-ink/50 mt-4">
            The kind of specific, evidence-backed finding Retrospect surfaces from your own entries --
            not a generic insight.
          </p>
        </motion.div>
      </section>

      {/* ---- Final CTA ---- */}
      <section className="max-w-6xl mx-auto px-4 md:px-6 py-14 md:py-20">
        <motion.div {...fadeUp} className="ui-card-hero p-8 md:p-14 text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
            Your future self is waiting.
          </h2>
          <p className="text-ink/70 mt-3 max-w-md mx-auto">
            Start with one entry. See what Equoria notices after a week.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 mt-6 px-7 py-3.5 min-h-12 ui-button-primary"
          >
            Get started free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="no-print border-t border-ink/10">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="ui-kicker text-ink-faint">Equoria</p>
          <div className="flex items-center gap-5 text-sm text-ink/60">
            <Link to="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link to="/login" className="hover:text-ink">
              Log in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
