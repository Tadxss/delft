import type { LabelHTMLAttributes } from "react";

export function FormLabel({
  className = "",
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control -- htmlFor arrives via ...props, the rule can't see through a wrapper component to confirm that statically
    <label
      className={`text-xs font-medium uppercase tracking-wide text-ink-500 ${className}`}
      {...props}
    />
  );
}
