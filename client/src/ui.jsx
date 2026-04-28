import { Link } from "react-router-dom";

export function Button({ children, variant = "primary", className = "", ...props }) {
  const variants = {
    primary:
      "bg-brand-300 text-slate-950 hover:bg-brand-200 focus-visible:ring-brand-200 disabled:opacity-60 disabled:hover:bg-brand-300",
    secondary:
      "bg-surface-200/80 text-white border border-cream-200/15 hover:bg-surface-100 focus-visible:ring-cream-200/40",
    ghost: "bg-transparent text-brand-100 hover:bg-white/8 focus-visible:ring-brand-200",
  };

  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({ children, to, variant = "primary", className = "", ...props }) {
  const variants = {
    primary: "bg-brand-300 text-slate-950 hover:bg-brand-200",
    secondary: "bg-surface-200/80 text-white border border-cream-200/15 hover:bg-surface-100",
    ghost: "bg-transparent text-brand-100 hover:bg-white/8",
  };

  return (
    <Link
      to={to}
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200/60 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </Link>
  );
}

export function Card({ children, className = "", title, ...props }) {
  return (
    <section className={`glass rounded-2xl p-4 md:p-5 ${className}`} {...props}>
      {title ? <p className="mb-2 text-xs uppercase tracking-wider text-brand-100">{title}</p> : null}
      {children}
    </section>
  );
}

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <Card className="rounded-3xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          {eyebrow ? <p className="text-brand-100 text-xs uppercase tracking-wider">{eyebrow}</p> : null}
          <h2 className="mt-2 text-3xl font-semibold md:text-4xl">{title}</h2>
          {description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">{description}</p> : null}
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
      className={`rounded-xl border px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200/60 ${
        isSelected ? "border-brand-100/50 bg-brand-300/25 text-white" : "border-cream-200/10 bg-surface-200/50 text-white/85 hover:bg-surface-100"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatusPill({ children, className = "" }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-full border border-brand-100/25 bg-brand-300/15 px-3 py-1 text-xs text-white ${className}`}>
      {children}
    </span>
  );
}

export function TextField({ label, id, className = "", as: Component = "input", ...props }) {
  return (
    <label className="block space-y-1.5 text-sm text-white/80" htmlFor={id}>
      <span>{label}</span>
      <Component
        id={id}
        className={`w-full rounded-xl border border-cream-200/10 bg-surface-300/80 p-3 text-white outline-none transition placeholder:text-white/35 focus:border-brand-200 focus:ring-2 focus:ring-brand-200/30 ${className}`}
        {...props}
      />
    </label>
  );
}

export function PageState({ title, message, action }) {
  return (
    <div className="glass rounded-2xl p-5 text-sm text-white/75">
      <p className="text-base font-medium text-white">{title}</p>
      {message ? <p className="mt-2 leading-6">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ eyebrow, title, message, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-cream-200/20 bg-surface-200/45 p-5 text-sm text-white/75">
      {eyebrow ? <p className="text-brand-100 text-xs uppercase tracking-wider">{eyebrow}</p> : null}
      <p className="mt-1 text-lg font-medium text-white">{title}</p>
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
