import { useState } from "react";
import { X } from "lucide-react";

// Shared dismissible callout for pointing at a feature the first time someone
// sees it (Keepsakes, Time Capsule, the theme cloud, etc). Previously each of
// these would have needed its own one-off "have I shown this before" state --
// this centralizes that as a single localStorage-backed key per tip id, so
// adding a new tip anywhere in the app is a one-line usage rather than a new
// piece of bespoke logic. Dismissal is permanent (closing it once means it
// never shows again for that id on this device) since these are meant to
// orient a first-time user, not nag a returning one.
const STORAGE_PREFIX = "equoria-tip-seen-";

function hasSeen(id) {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${id}`) === "1";
  } catch {
    return false;
  }
}

function markSeen(id) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, "1");
  } catch {
    // localStorage unavailable (private browsing, etc) -- tip will just
    // reappear next load, not worth failing over.
  }
}

export default function FirstTimeTip({ id, children, className = "" }) {
  const [dismissed, setDismissed] = useState(() => hasSeen(id));

  if (dismissed) return null;

  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border border-[#c5d7a6]/30 bg-[#8fae73]/12 px-3.5 py-2.5 text-xs text-white/80 leading-5 ${className}`}
    >
      <p className="flex-1">{children}</p>
      <button
        type="button"
        onClick={() => {
          markSeen(id);
          setDismissed(true);
        }}
        aria-label="Dismiss tip"
        className="shrink-0 -m-1 p-1 rounded-lg hover:bg-white/10 transition"
      >
        <X size={13} />
      </button>
    </div>
  );
}
