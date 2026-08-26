import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { apiFetch } from "../api";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";
import { moodDotStyle } from "../utils/moodColors";

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.09 } } };
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};
const staticContainerVariants = { hidden: {}, visible: {} };
const staticItemVariants = { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } };

// Renders the year-in-review summary onto a plain <canvas> and downloads it
// as a PNG -- a "Wrapped"-style share card, since this page is explicitly
// framed (see the comment on the default export below) as an occasional
// celebratory moment, and previously there was no way to save or share it
// anywhere once you closed the tab. Deliberately canvas-drawn rather than a
// DOM-to-image library: no new dependency, and the summary is a handful of
// numbers/strings, not a pixel-perfect capture of the live page.
async function downloadShareCard(data, memberSince) {
  const width = 1080;
  const height = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, "#FFFFFF");
  bgGrad.addColorStop(1, "#E8E0CB");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const accentGrad = ctx.createRadialGradient(width * 0.85, height * 0.08, 20, width * 0.85, height * 0.08, 520);
  accentGrad.addColorStop(0, "rgba(61,79,209,0.16)");
  accentGrad.addColorStop(1, "rgba(61,79,209,0)");
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#3D4FD1";
  ctx.font = "600 28px 'JetBrains Mono', monospace";
  ctx.fillText("EQUORIA", 80, 130);

  ctx.fillStyle = "#17140F";
  ctx.font = "600 56px 'Space Grotesk', sans-serif";
  wrapText(ctx, "Your year, reflected", 80, 210, width - 160, 62);

  ctx.fillStyle = "rgba(23,20,15,0.6)";
  ctx.font = "24px Inter, sans-serif";
  ctx.fillText(`Journaling since ${memberSince}`, 80, 300);

  let y = 420;
  drawStat(ctx, "Entries written", String(data.totalEntries ?? "--"), 80, y);
  y += 150;
  drawStat(ctx, "Longest streak", `${data.longestStreak ?? "--"} days`, 80, y);
  y += 150;
  if (data.topMood) drawStat(ctx, "Most common mood", data.topMood, 80, y);
  y += 150;

  if (data.topThemes?.length > 0) {
    ctx.fillStyle = "rgba(23,20,15,0.5)";
    ctx.font = "20px 'JetBrains Mono', monospace";
    ctx.fillText("WHAT YOU WROTE ABOUT MOST", 80, y);
    ctx.fillStyle = "#17140F";
    ctx.font = "30px Inter, sans-serif";
    const themeLine = data.topThemes.slice(0, 5).map((t) => t.theme.replace(/_/g, " ")).join("  ·  ");
    wrapText(ctx, themeLine, 80, y + 46, width - 160, 40);
  }

  ctx.fillStyle = "rgba(23,20,15,0.4)";
  ctx.font = "20px 'JetBrains Mono', monospace";
  ctx.fillText(`${data.totalWords?.toLocaleString?.() ?? data.totalWords ?? 0} words in total`, 80, height - 80);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `equoria-year-in-review-${new Date().toISOString().slice(0, 10)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function drawStat(ctx, label, value, x, y) {
  ctx.fillStyle = "rgba(23,20,15,0.5)";
  ctx.font = "20px 'JetBrains Mono', monospace";
  ctx.fillText(label.toUpperCase(), x, y);
  ctx.fillStyle = "#17140F";
  ctx.font = "600 64px 'Space Grotesk', sans-serif";
  ctx.fillText(value, x, y + 76);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

// A "wrapped"-style retrospective, backed entirely by data this app already
// has (GET /api/year-in-review -- see server/src/modules/yearInReview/routes.js).
// Deliberately allowed a little more visual presence than the rest of the
// app's restrained everyday UI (a big serif number per story card) since
// this is meant to be an occasional, celebratory moment someone opens once
// in a while, not a screen they live in day to day -- the same distinction
// Spotify Wrapped or an app's own "year in review" makes from its normal UI.
export default function YearInReviewPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const cVariants = reducedMotion ? staticContainerVariants : containerVariants;
  const iVariants = reducedMotion ? staticItemVariants : itemVariants;

  useEffect(() => {
    apiFetch("/api/year-in-review")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="ui-page">
        <div className="max-w-2xl mx-auto space-y-4 py-6">
          <div className="skeleton h-24 w-full rounded-2xl" />
          <div className="skeleton h-40 w-full rounded-2xl" />
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="skeleton h-28 w-full rounded-2xl" />
            <div className="skeleton h-28 w-full rounded-2xl" />
          </div>
        </div>
      </main>
    );
  }

  if (!data?.hasData) {
    return (
      <main className="ui-page">
        <div className="max-w-2xl mx-auto ui-card rounded-2xl p-8 text-center">
          <p className="ui-kicker">Year in review</p>
          <h2 className="ui-title mt-2">Not enough entries yet</h2>
          <p className="text-sm text-ink/70 mt-3">
            Keep journaling and this page will fill in with your own highlights -- moods, streaks, themes, and more.
          </p>
          <Link to="/journal/new" className="inline-flex mt-5 px-4 py-2.5 min-h-11 text-sm ui-button-primary">
            Write an entry
          </Link>
        </div>
      </main>
    );
  }

  const memberSince = new Date(data.memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  async function handleShare() {
    setSharing(true);
    try {
      await downloadShareCard(data, memberSince);
    } catch {
      // best-effort -- canvas/download APIs are broadly supported, but if
      // something in the environment blocks it there's nothing useful to
      // recover into beyond just not showing a card.
    } finally {
      setSharing(false);
    }
  }

  // moodCounts was already being sent by the server and never rendered
  // anywhere on this page -- the raw material for a real chart sitting
  // unused, on the one page in the app with zero charts on it at all
  // (every other page -- Dashboard, Health, Retrospect -- has at least one
  // real visualization by now). Same ranked-bar treatment Retrospect's
  // MoodBalance uses, not a donut, for the same reason: length reads more
  // precisely than angle, and it keeps the app's charts speaking one
  // consistent visual language instead of introducing a new chart type
  // just for this page.
  const moodEntries = Object.entries(data.moodCounts || {}).sort((a, b) => b[1] - a[1]);
  const moodTotal = moodEntries.reduce((sum, [, c]) => sum + c, 0);
  const maxMoodCount = moodEntries[0]?.[1] || 1;

  return (
    <main className="ui-page">
      <motion.div className="max-w-4xl mx-auto space-y-4" variants={cVariants} initial="hidden" animate="visible">
        <motion.div variants={iVariants} className="text-center py-6">
          <p className="ui-kicker">Your year, reflected</p>
          <h1 className="ui-title text-3xl mt-2">The past 12 months</h1>
          <p className="text-sm text-ink/60 mt-2">Journaling since {memberSince}</p>
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-ink/15 bg-ink/5 hover:bg-ink/10 text-xs disabled:opacity-60"
          >
            <Download size={13} />
            {sharing ? "Preparing..." : "Save as image"}
          </button>
        </motion.div>

        {/* .ui-card-hero + .ui-hero-number -- the true hero of the whole
            page, so it gets both the bigger-radius card tier and the same
            wide hero-number scale Health/Dashboard use for their one big
            number, instead of a one-off text-6xl bolted onto .ui-title.
            Longest streak and top mood folded into the same card as
            secondary stats (a dense strip, like Dashboard's hero card)
            instead of each getting its own separate full-width card below --
            three numbers that used to take three cards' worth of vertical
            space and empty padding now share one. */}
        <motion.div variants={iVariants} className="ui-card-hero p-6 md:p-8">
          <div className="text-center">
            <p className="text-xs text-ink/60 uppercase tracking-wide">Entries written</p>
            <p className="ui-hero-number text-6xl mt-2 text-accent-ember">{data.totalEntries}</p>
            <p className="text-sm text-ink/60 mt-2">
              across {data.daysJournaled} {data.daysJournaled === 1 ? "day" : "days"} -- {data.totalWords.toLocaleString()} words in total
            </p>
          </div>
          <div className="grid grid-cols-2 mt-6 pt-5 border-t border-ink/10 max-w-sm mx-auto">
            <div className="text-center border-r border-ink/10">
              <p className="text-xl font-medium">{data.longestStreak}</p>
              <p className="text-xs text-ink/55 mt-0.5">longest streak</p>
            </div>
            <div className="text-center">
              {data.topMood ? (
                <p className="text-xl font-medium capitalize flex items-center justify-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={moodDotStyle(data.topMood)} />
                  {data.topMood}
                </p>
              ) : (
                <p className="text-xl font-medium">--</p>
              )}
              <p className="text-xs text-ink/55 mt-0.5">most common mood</p>
            </div>
          </div>
        </motion.div>

        <motion.div variants={iVariants} className="grid md:grid-cols-2 gap-4 items-start">
          {/* Real chart, not just a number and a label -- the mood ranking
              the "most common mood" stat above is a summary of. */}
          {moodEntries.length > 0 && (
            <div className="ui-card rounded-2xl p-6">
              <p className="text-xs text-ink/60 uppercase tracking-wide">Mood balance</p>
              <p className="text-xs text-ink/45 mt-0.5">The whole year, by proportion.</p>
              <div className="mt-4 space-y-2.5">
                {moodEntries.map(([mood, count]) => {
                  const pct = moodTotal ? Math.round((count / moodTotal) * 100) : 0;
                  return (
                    <div key={mood} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 text-xs text-ink/70 capitalize">{mood}</span>
                      <div className="ui-bar-track flex-1 h-2 rounded-full bg-ink/8 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(4, (count / maxMoodCount) * 100)}%`,
                            ...moodDotStyle(mood),
                            backgroundImage: "linear-gradient(180deg, rgb(255 255 255 / 0.35), rgb(255 255 255 / 0) 65%)",
                          }}
                        />
                      </div>
                      <span className="w-9 shrink-0 text-right text-xs text-ink/55 ui-mono">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data.topThemes?.length > 0 && (
            <div className="ui-card rounded-2xl p-6">
              <p className="text-xs text-ink/60 uppercase tracking-wide">What you wrote about most</p>
              <p className="text-xs text-ink/45 mt-0.5">Most-recurring themes, ranked.</p>
              {/* Consistent chip size + a count badge instead of the
                  font-size-implies-rank pattern used before (and the theme
                  cloud on the Write page used to have, at a more extreme
                  12-28px range) -- same "why is this one bigger" confusion
                  either way, just fixed here too for the same reason. */}
              <div className="flex flex-wrap gap-2 mt-4">
                {data.topThemes.map(({ theme, count }) => (
                  <span
                    key={theme}
                    className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-lg border border-ink/10 bg-ink/5 capitalize text-sm"
                  >
                    {theme.replace(/_/g, " ")}
                    <span className="ui-mono text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-ink/10 text-ink/50">
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {(data.bestMonth || data.hardestMonth) && (
          <motion.div variants={iVariants} className="grid sm:grid-cols-2 gap-4">
            {data.bestMonth && (
              <div className="ui-card rounded-2xl p-6 text-center">
                <p className="text-xs text-ink/60 uppercase tracking-wide">Brightest stretch</p>
                <p className="text-xl font-medium mt-2">{data.bestMonth.label}</p>
                <p className="text-xs text-ink/50 mt-1">{data.bestMonth.count} entries</p>
              </div>
            )}
            {data.hardestMonth && data.hardestMonth.label !== data.bestMonth?.label && (
              <div className="ui-card rounded-2xl p-6 text-center">
                <p className="text-xs text-ink/60 uppercase tracking-wide">Hardest stretch</p>
                <p className="text-xl font-medium mt-2">{data.hardestMonth.label}</p>
                <p className="text-xs text-ink/50 mt-1">{data.hardestMonth.count} entries</p>
              </div>
            )}
          </motion.div>
        )}

        {data.correlationHighlight && (
          <motion.div variants={iVariants} className="ui-quote py-1 mx-2">
            <p className="ui-kicker">A pattern worth knowing</p>
            <p className="ui-quote-text text-lg mt-2 leading-relaxed text-ink/95">{data.correlationHighlight}</p>
          </motion.div>
        )}

        <motion.div variants={iVariants} className="text-center pt-4 pb-8">
          <Link to="/retrospect" className="text-sm text-ink/50 hover:text-ink/80">
            Back to Retrospect
          </Link>
        </motion.div>
      </motion.div>
    </main>
  );
}
