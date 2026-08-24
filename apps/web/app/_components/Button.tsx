import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

// Four variants matching what's actually used today, not a from-scratch design: `primary` is the
// existing accent-filled CTA style, `secondary` matches the outlined "Email me a sign-in link
// instead" button, `ghost` matches icon-only nav buttons (Back/Close in AccountModal, etc.),
// `destructive` matches the vault-reset pages' red confirm buttons — same shape as `primary`, red
// instead of accent, added here (Build Order step 72) once it recurred in two places rather than
// staying a one-off. `ghost` deliberately keeps its own compact padding rather than sharing
// primary/secondary's px-3 py-2 — icon buttons size themselves to their icon, not to a text
// button's scale — so callers pass `className` to adjust that per context, same as before this
// component existed.
//
// `primary`/`destructive` use a literal `text-white` rather than the theme-flipping `text-paper-50`
// (Build Order step 73) — that flip only gives good contrast when the fill color sits at a
// brightness extreme per theme, which held for the old ink-800-filled buttons and the old pastel
// dark-mode blue accent, but breaks for the crow palette's Electric Violet (#8B5CF6), a
// medium-brightness color where near-black text (paper-50's dark value) reads muddy. White is the
// better of the two options against violet in both themes, even though dark mode's ratio is still
// technically borderline AA (~4.3:1) — inherent to choosing a punchy mid-tone accent, not a bug.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "rounded-md bg-accent-500 px-3 py-2 font-medium text-white hover:bg-accent-600",
  secondary:
    "rounded-md border border-paper-200 px-3 py-2 text-ink-600 hover:bg-paper-50",
  ghost: "rounded px-1 py-1 text-ink-500 hover:bg-paper-100 hover:text-ink-800",
  destructive: "rounded-md bg-red-700 px-3 py-2 font-medium text-white hover:bg-red-800",
};

export function Button({
  variant = "primary",
  type = "button",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`text-sm transition-colors disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
