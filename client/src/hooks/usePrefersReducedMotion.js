import { useEffect, useState } from "react";

// Shared across every page that uses framer-motion entrance/stagger
// animations (Dashboard, Retrospect, Health, Chat, Year in Review) --
// previously only the plain-CSS animations (.page-transition, .skeleton,
// streak glow) respected prefers-reduced-motion; framer-motion variants
// defined per-page never checked it at all. One hook, reused everywhere,
// so a page's motion variants can branch to an instant (no-slide, no-fade)
// version instead of hardcoding a media query per file.
export default function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  return reduced;
}
