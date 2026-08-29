import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";

// The one styling string every text input/select/textarea in the app repeated independently
// (verbatim, at minimum a dozen+ times) before this existed — kept as a single constant so the
// three tag-specific wrappers below can't drift from each other.
const FIELD_CLASSES =
  "rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none placeholder:text-ink-400 focus:border-accent-500";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_CLASSES} ${className}`} {...props} />;
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${FIELD_CLASSES} ${className}`} {...props} />;
}

// Native <select>, but with the OS arrow swapped for a lucide chevron — the native one renders
// flush to the right border (px-3 pads the option text, not the arrow). `appearance-none` drops
// it, `pr-9` reserves room, and the chevron sits at right-3 (matching the field padding) in a
// theme-aware color. All props still land on the <select>, so `id`/`value`/`onChange` and
// Playwright's selectOption work unchanged.
export function Select({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select
        className={`${FIELD_CLASSES} block w-full cursor-pointer appearance-none pr-9 ${className}`}
        {...props}
      />
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
      />
    </span>
  );
}
