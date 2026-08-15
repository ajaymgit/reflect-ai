// A Nightingale-style rose (polar area) chart of mood distribution --
// data server/src/modules/dashboard/routes.js has always computed
// (`emotionDistribution`) but nothing in the client ever rendered; it just
// sat unused in the API response. Recharts doesn't ship a real polar-bar/
// rose primitive (RadialBarChart is concentric progress rings, a different
// shape), so this is hand-rolled SVG: six equal 60-degree wedges, one per
// mood, in a fixed always-in-the-same-place order so the shape is
// comparable across visits rather than reshuffling by count each time.
//
// Radius is proportional to sqrt(count), not count directly -- a wedge's
// visual weight is its AREA, which grows with radius squared, so encoding
// count as a linear radius would make larger values look disproportionately
// bigger than they really are relative to the rest. This is the same
// area-correct convention Florence Nightingale's original rose diagrams
// used.
import { MOOD_META } from "../utils/moodColors";

const MOOD_ORDER = MOOD_META.map(({ key, label, hex }) => ({ key, label, color: hex }));

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wedgePath(cx, cy, r, startAngle, endAngle) {
  if (r <= 0) return "";
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx},${cy} L ${start.x.toFixed(2)},${start.y.toFixed(2)} A ${r},${r} 0 ${largeArcFlag} 0 ${end.x.toFixed(2)},${end.y.toFixed(2)} Z`;
}

export default function MoodRoseChart({ distribution }) {
  const size = 220;
  const center = size / 2;
  const maxRadius = center - 14;
  const counts = MOOD_ORDER.map((m) => distribution?.[m.key] || 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const maxCount = Math.max(...counts, 1);
  const wedgeAngle = 360 / MOOD_ORDER.length;

  return (
    <div className="flex flex-col items-center gap-3">
      {total === 0 ? (
        <p className="text-sm text-white/60 py-8">Not enough entries yet to show a mood distribution.</p>
      ) : (
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Mood distribution rose chart">
          {/* Faint reference rings so wedge length has a scale to read against. */}
          {[0.33, 0.66, 1].map((frac) => (
            <circle
              key={frac}
              cx={center}
              cy={center}
              r={maxRadius * frac}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
          ))}
          {MOOD_ORDER.map((mood, i) => {
            const count = counts[i];
            const r = count > 0 ? maxRadius * Math.sqrt(count / maxCount) : 0;
            const startAngle = i * wedgeAngle;
            const endAngle = startAngle + wedgeAngle;
            return (
              <path
                key={mood.key}
                d={wedgePath(center, center, r, startAngle, endAngle)}
                fill={mood.color}
                fillOpacity={0.78}
                stroke="rgba(0,0,0,0.25)"
                strokeWidth={1}
              >
                <title>
                  {mood.label}: {count} {count === 1 ? "entry" : "entries"}
                </title>
              </path>
            );
          })}
          <circle cx={center} cy={center} r={2.5} fill="rgba(255,255,255,0.4)" />
        </svg>
      )}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {MOOD_ORDER.map((mood, i) => (
          <span key={mood.key} className="inline-flex items-center gap-1.5 text-xs text-white/70">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: mood.color }} />
            {mood.label} ({counts[i]})
          </span>
        ))}
      </div>
    </div>
  );
}
