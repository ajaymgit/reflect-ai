import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Shared show/hide password field -- previously every password input in the
// app (login, register, reset password, disable-2FA) was a plain
// type="password" input with no way to check what you'd typed, which is a
// common source of failed logins/typos on mobile in particular.
export default function PasswordInput({ className = "", inputClassName = "ui-input", ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <input {...props} type={visible ? "text" : "password"} className={`${inputClassName} pr-11`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/50 hover:text-ink/80"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
