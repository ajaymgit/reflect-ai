import { useEffect, useRef } from "react";

// Shared baseline for every full-screen overlay in the app (EntryModal, the
// Keepsakes globe viewer, StreakMilestone, first-run Onboarding) -- all four
// were independently built as a fixed-position div with a backdrop click and
// (in one case) an Escape handler, but none of them told assistive tech it
// was looking at a dialog at all, and only EntryModal closed on Escape.
// Screen-reader users got no "you're in a dialog now" announcement, and
// keyboard users had no consistent way to back out short of tabbing around
// hunting for a close button.
//
// This covers the two cheap, high-value pieces of real modal behavior:
// 1. Escape closes it (every overlay, not just EntryModal).
// 2. Focus moves into the dialog on open, and back to whatever was focused
//    before it opened once it closes -- so a keyboard user's position in the
//    page isn't lost the moment an overlay appears or disappears.
//
// Deliberately NOT a full focus trap (Tab still cycles through the whole
// page, not just the dialog) -- that's a real gap this doesn't close, but a
// proper trap needs to walk the dialog's own focusable-element list on every
// render and is enough extra surface area to get subtly wrong (e.g. trapping
// focus inside a dialog that still has content-driven conditional buttons,
// like EntryModal's edit/delete state). Escape-to-close plus focus-in/
// focus-restore is the same "real improvement, honestly scoped" tradeoff
// already used elsewhere in this app rather than something oversold as a
// complete WAI-ARIA dialog pattern.
export default function useDialogA11y(onClose, { active = true } = {}) {
  const containerRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!active) return undefined;

    previouslyFocused.current = document.activeElement;
    // Container itself (not a specific child) gets initial focus -- these
    // dialogs don't have a single obvious "first field" the way a form does,
    // and focusing the container (via tabIndex={-1}, added alongside this
    // hook) is enough to move the screen reader's reading position and the
    // keyboard's tab order into the dialog without guessing which inner
    // element should get it.
    containerRef.current?.focus?.();

    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      // Restore focus to whatever triggered the dialog -- without this, focus
      // silently falls back to <body> when the dialog unmounts, and a
      // keyboard user has to re-find their place in the page from scratch.
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return containerRef;
}
