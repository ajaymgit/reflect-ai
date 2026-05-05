import { Link } from "react-router-dom";

export function Button({ children, variant = "primary", className = "", ...props }) {
  const variants = {
    primary:
      "bg-brand-300 text-[#4a3a31] shadow-[0_4px_12px_rgba(124,97,80,0.18)] hover:bg-brand-200 focus-visible:ring-brand-200 disabled:opacity-60 disabled:hover:bg-brand-300",
    secondary:
      "bg-surface-100 text-[#4a3a31] border border-[#dbc2b2] hover:bg-surface-200 focus-visible:ring-brand-200/40",
    ghost: "bg-transparent text-[#5a3d2c] hover:bg-[#f3e7dc] focus-visible:ring-brand-200",
  };

  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center rounded-[20px] px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fdfbf7] ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({ children, to, variant = "primary", className = "", ...props }) {
  const variants = {
    primary: "bg-brand-300 text-[#4a3a31] hover:bg-brand-200 shadow-[0_4px_12px_rgba(124,97,80,0.18)]",
    secondary: "bg-surface-100 text-[#4a3a31] border border-[#dbc2b2] hover:bg-surface-200",
    ghost: "bg-transparent text-[#5a3d2c] hover:bg-[#f3e7dc]",
  };

  return (
    <Link
      to={to}
      className={`inline-flex min-h-[44px] items-center justify-center rounded-[20px] px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200/60 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </Link>
  );
}

export function Card({ children, className = "", title, ...props }) {
  return (
    <section className={`glass rounded-[24px] p-5 md:p-6 hover:shadow-[0_8px_22px_rgba(0,0,0,0.16)] transition ${className}`} {...props}>
      {title ? <p className="mb-2 text-xs uppercase tracking-wider text-brand-100">{title}</p> : null}
      {children}
    </section>
  );
}

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <Card className="rounded-[24px]">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          {eyebrow ? <p className="text-brand-100 text-xs uppercase tracking-wider">{eyebrow}</p> : null}
          <h2 className="mt-2 text-3xl font-semibold md:text-[2.45rem] md:leading-[1.06]">{title}</h2>
          {description ? <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#5a3d2c]">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
      </div>
    </Card>
  );
}

export function ToggleButton({ selected, pressed, children, className = "", ...props }) {
  const isSelected = selected ?? pressed;
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      className={`rounded-[20px] border px-3 py-2 min-h-[44px] text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200/60 ${
        isSelected ? "border-brand-200 bg-brand-100 text-[#4a3a31]" : "border-[#dbc2b2] bg-surface-100 text-[#5a3d2c] hover:bg-surface-200"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatusPill({ children, className = "" }) {
  return (
    <span className={`inline-flex min-h-[32px] items-center justify-center rounded-full border border-brand-200 bg-brand-100 px-3 py-1 text-xs text-[#4a3a31] ${className}`}>
      {children}
    </span>
  );
}

export function TextField({ label, id, className = "", as: Component = "input", ...props }) {
  return (
    <label className="block space-y-1.5 text-sm text-[#5a3d2c]" htmlFor={id}>
      <span>{label}</span>
      <Component
        id={id}
        className={`w-full min-h-[44px] rounded-[16px] border border-[#dbc2b2] bg-[#fff7ef] p-3 text-[#4a3a31] outline-none transition placeholder:text-[#6f4c36] focus:border-brand-200 focus:ring-2 focus:ring-brand-200/30 ${className}`}
        {...props}
      />
    </label>
  );
}

export function PageState({ title, message, action }) {
  return (
    <div className="glass rounded-3xl p-6 text-sm text-[#5a3d2c]">
      <p className="text-lg font-semibold text-[#4a3a31]">{title}</p>
      {message ? <p className="mt-2 leading-6">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ eyebrow, title, message, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d8c4b5] bg-surface-100 p-5 text-sm text-[#5a3d2c]">
      {eyebrow ? <p className="text-brand-100 text-xs uppercase tracking-wider">{eyebrow}</p> : null}
      <p className="mt-1 text-lg font-medium text-[#4a3a31]">{title}</p>
      {message ? <p className="mt-2 leading-6">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function MetricSkeleton() {
  return (
    <div className="glass skeleton-pulse rounded-2xl p-5" aria-hidden="true">
      <div className="h-4 w-24 rounded bg-white/10" />
      <div className="mt-3 h-8 w-16 rounded bg-white/10" />
    </div>
  );
}
