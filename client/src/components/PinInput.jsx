import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Deliberately NOT type="password" -- app lock's PIN is a device-only
// convenience gate (see hooks/useAppLock.js), not an account credential, and
// browsers/password-manager extensions treat any type="password" field as
// something to offer to save, autofill, or generate a "stronger" value for.
// Confirmed live: a password-manager extension intercepted focus on a
// type="password" PIN field and popped its own suggestion UI right in the
// middle of filling this out. -webkit-text-security gives the same
// hidden-by-default, click-to-reveal masking as PasswordInput without any
// of that -- Chrome/Safari support it; browsers that don't (Firefox) just
// show the digits in plain text, which is an acceptable degradation for a
// locally-stored PIN.
export default function PinInput({ className = "", inputClassName = "ui-input", ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        style={visible ? undefined : { WebkitTextSecurity: "disc" }}
        className={`${inputClassName} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Hide PIN" : "Show PIN"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/50 hover:text-ink/80"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
