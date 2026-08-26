// Kicker + serif title + optional description, the one open/close pattern
// every page in the app starts with -- pulled into one component so all ten
// pages render it identically instead of each hand-writing the same three
// lines with slightly different spacing.
export default function PageHeader({ kicker, title, description, children }) {
  return (
    <div>
      {kicker && <p className="ui-kicker">{kicker}</p>}
      <h1 className="ui-title mt-1">{title}</h1>
      {description && <p className="text-sm text-ink-muted mt-2">{description}</p>}
      {children}
    </div>
  );
}
