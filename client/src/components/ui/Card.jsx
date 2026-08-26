// Real Card primitive instead of `className="ui-card rounded-2xl p-5"`
// copy-pasted (and subtly drifting -- p-4 here, p-6 there, rounded-2xl vs
// rounded-xl) across every page by hand. `hero` controls which radius tier
// renders (see .ui-card/.ui-card-hero in index.css) -- pass it on the one
// card per page that should read as the main event, leave it off everywhere
// else, and the hierarchy is enforced by the component instead of by
// whether whoever wrote that page remembered to vary it.
const PADDING = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6 md:p-7",
  xl: "p-8",
};

export default function Card({ hero = false, padding = "md", className = "", children, ...rest }) {
  const base = hero ? "ui-card-hero" : "ui-card rounded-2xl";
  return (
    <div className={`${base} ${PADDING[padding]} ${className}`} {...rest}>
      {children}
    </div>
  );
}
