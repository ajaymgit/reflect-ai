import { useEffect, useRef, useState } from "react";

// Counts up from its previous value to `value` over `duration` ms instead of
// just popping in -- used on Dashboard stat cards. Falls back to rendering
// `value` directly (no animation) when it isn't a plain finite number (e.g.
// "--" while loading, or a mood string), so it's safe to use as a drop-in
// replacement anywhere a number OR a placeholder string might show up.
export default function AnimatedNumber({ value, duration = 700, formatter }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const isNumeric = typeof value === "number" && Number.isFinite(value);
    if (!isNumeric) {
      setDisplay(value);
      return;
    }
    const from = typeof fromRef.current === "number" ? fromRef.current : 0;
    const to = value;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      // ease-out-cubic -- fast start, gentle settle, feels less mechanical
      // than a linear count.
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      setDisplay(Math.round(current));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{formatter ? formatter(display) : display}</>;
}
