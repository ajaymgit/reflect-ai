import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { apiFetch } from "../api";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";
import { MOOD_BG_CLASS as moodDotColors } from "../utils/moodColors";

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
  bgGrad.addColorStop(0, "#1b241f");
  bgGrad.addColorStop(1, "#121a16");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const accentGrad = ctx.createRadialGradient(width * 0.85, height * 0.08, 20, width * 0.85, height * 0.08, 520);
  accentGrad.addColorStop(0, "rgba(210,126,86,0.35)");
  accentGrad.addColorStop(1, "rgba(210,126,86,0)");
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#d9d2b0";
  ctx.font = "600 28px 'IBM Plex Mono', monospace";
  ctx.fillText("EQUORIA", 80, 130);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "600 56px Georgia, serif";
  wrapText(ctx, "Your year, reflected", 80, 210, width - 160, 62);

  ctx.fillStyle = "rgba(248,250,252,0.6)";
  ctx.font = "24px Manrope, sans-serif";
  ctx.fillText(`Journaling since ${memberSince}`, 80, 300);

  let y = 420;
  drawStat(ctx, "Entries written", String(data.totalEntries ?? "--"), 80, y);
  y += 150;
  drawStat(ctx, "Longest streak", `${data.longestStreak ?? "--"} days`, 80, y);
  y += 150;
  if (data.topMood) drawStat(ctx, "Most common mood", data.topMood, 80, y);
  y += 150;

  if (data.topThemes?.length > 0) {
    ctx.fillStyle = "rgba(248,250,252,0.45)";
    ctx.font = "20px 'IBM Plex Mono', monospace";
    ctx.fillText("WHAT YOU WROTE ABOUT MOST", 80, y);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "30px Manrope, sans-serif";
    const themeLine = data.topThemes.slice(0, 5).map((t) => t.theme.replace(/_/g, " ")).join("  ·  ");
    wrapText(ctx, themeLine, 80, y + 46, width - 160, 40);
  }

  ctx.fillStyle = "rgba(248,250,252,0.35)";
  ctx.font = "20px 'IBM Plex Mono', monospace";
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
  ctx.fillStyle = "rgba(248,250,252,0.45)";
  ctx.font = "20px 'IBM Plex Mono', monospace";
  ctx.fillText(label.toUpperCase(), x, y);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "600 64px Georgia, serif";
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
          <p className="text-sm text-white/70 mt-3">
            Keep journaling and this page will fill in with your own highlights -- moods, streaks, themes, and more.
          </p>
          <Link to="/journal/new" className="inline-flex mt-5 px-4 py-2.5 text-sm ui-button-primary">
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

  return (
    <main className="ui-page">
      <motion.div className="max-w-2xl mx-auto space-y-4" variants={cVariants} initial="hidden" animate="visible">
        <motion.div variants={iVariants} className="text-center py-6">
          <p className="ui-kicker">Your year, reflected</p>
          <h1 className="ui-title text-3xl mt-2">The past 12 months</h1>
          <p className="text-sm text-white/60 mt-2">Journaling since {memberSince}</p>
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs disabled:opacity-60"
          >
            <Download size={13} />
            {sharing ? "Preparing..." : "Save as image"}
          </button>
        </motion.div>

        <motion.div variants={iVariants} className="ui-card rounded-2xl p-8 text-center">
          <p className="text-xs text-white/60 uppercase tracking-wide">Entries written</p>
          <p className="ui-title text-6xl mt-2">{data.totalEntries}</p>
          <p className="text-sm text-white/60 mt-2">
            across {data.daysJournaled} {data.daysJournaled === 1 ? "day" : "days"} -- {data.totalWords.toLocaleString()} words in total
          </p>
        </motion.div>

        <motion.div variants={iVariants} className="grid sm:grid-cols-2 gap-4">
          <div className="ui-card rounded-2xl p-6 text-center">
            <p className="text-xs text-white/60 uppercase tracking-wide">Longest streak</p>
            <p className="ui-title text-4xl mt-2">{data.longestStreak}</p>
            <p className="text-sm text-white/60 mt-1">consecutive days</p>
          </div>
          <div className="ui-card rounded-2xl p-6 text-center">
            <p className="text-xs text-white/60 uppercase tracking-wide">Most common mood</p>
            {data.topMood && (
              <p className="ui-title text-4xl mt-2 capitalize flex items-center justify-center gap-2">
                <span className={`h-3 w-3 rounded-full ${moodDotColors[data.topMood] || "bg-white/40"}`} />
                {data.topMood}
              </p>
            )}
          </div>
        </motion.div>

        {data.topThemes?.length > 0 && (
          <motion.div variants={iVariants} className="ui-card rounded-2xl p-6">
            <p className="text-xs text-white/60 uppercase tracking-wide text-center mb-4">What you wrote about most</p>
            <div className="flex flex-wrap justify-center gap-2">
              {data.topThemes.map(({ theme, count }, i) => (
                <span
                  key={theme}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 capitalize"
                  style={{ fontSize: `${Math.max(12, 16 - i)}px` }}
                >
                  {theme.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {(data.bestMonth || data.hardestMonth) && (
          <motion.div variants={iVariants} className="grid sm:grid-cols-2 gap-4">
            {data.bestMonth && (
              <div className="ui-card rounded-2xl p-6 text-center">
                <p className="text-xs text-white/60 uppercase tracking-wide">Brightest stretch</p>
                <p className="text-xl font-medium mt-2">{data.bestMonth.label}</p>
                <p className="text-xs text-white/50 mt-1">{data.bestMonth.count} entries</p>
              </div>
            )}
            {data.hardestMonth && data.hardestMonth.label !== data.bestMonth?.label && (
              <div className="ui-card rounded-2xl p-6 text-center">
                <p className="text-xs text-white/60 uppercase tracking-wide">Hardest stretch</p>
                <p className="text-xl font-medium mt-2">{data.hardestMonth.label}</p>
                <p className="text-xs text-white/50 mt-1">{data.hardestMonth.count} entries</p>
              </div>
            )}
          </motion.div>
        )}

        {data.correlationHighlight && (
          <motion.div variants={iVariants} className="ui-card rounded-2xl p-6">
            <p className="text-xs text-white/60 uppercase tracking-wide mb-3">A pattern worth knowing</p>
            <p className="text-sm text-white/85 leading-relaxed">{data.correlationHighlight}</p>
          </motion.div>
        )}

        <motion.div variants={iVariants} className="text-center pt-4 pb-8">
          <Link to="/retrospect" className="text-sm text-white/50 hover:text-white/80">
            Back to Retrospect
          </Link>
        </motion.div>
      </motion.div>
    </main>
  );
}
