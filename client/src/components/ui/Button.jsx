import { Link } from "react-router-dom";

// One real Button component instead of every page copy-pasting the same
// three className strings (ui-button-primary/ghost/danger) by hand -- this
// was one of the concrete "not actually a design system" tells: the classes
// existed, but nothing forced a page to use them consistently, and each
// call site independently decided its own padding/text-size on top. Button
// owns padding and text size per `size`, so "a primary button" always means
// the same thing everywhere instead of being re-decided per page.
//
// Renders a <Link> when `to` is passed, a real <button> otherwise -- so the
// same component covers both "navigate somewhere" and "submit this form"
// without a caller needing to pick the right element by hand.
const VARIANTS = {
  primary: "ui-button-primary",
  ghost: "ui-button-ghost",
  danger: "ui-button-danger",
};

const SIZES = {
  sm: "px-3.5 py-2 text-xs min-h-9",
  md: "px-4 py-2.5 text-sm min-h-11",
  lg: "px-5 py-3 text-base min-h-12",
};

export default function Button({
  variant = "primary",
  size = "md",
  to,
  className = "",
  children,
  ...rest
}) {
  const classes = `inline-flex items-center justify-center gap-2 ${VARIANTS[variant]} ${SIZES[size]} ${className}`;

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
