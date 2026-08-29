"use client";

import { Check } from "lucide-react";
import { USAGE_OPTIONS } from "../_lib/usageOptions";

// Controlled multi-select for profiles.usage_intent. Hand-rolled checkbox buttons (the repo has
// no checkbox primitive) — same shape as AccountModal's ThemePicker radio group, with a square
// check instead of a dot. `value` is the list of selected option labels.
export function UsageCheckboxes({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(option: string) {
    onChange(
      value.includes(option)
        ? value.filter((v) => v !== option)
        : [...value, option],
    );
  }

  return (
    <div role="group" aria-label="How you use CrowScribe" className="flex flex-col gap-2">
      {USAGE_OPTIONS.map((option) => {
        const active = value.includes(option);
        return (
          <button
            key={option}
            type="button"
            role="checkbox"
            aria-checked={active}
            onClick={() => toggle(option)}
            className={`flex w-full items-center gap-3 rounded-md border px-4 py-2.5 text-left text-sm ${
              active
                ? "border-accent-500 text-ink-800"
                : "border-paper-200 text-ink-600 hover:bg-paper-100"
            }`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                active
                  ? "border-accent-500 bg-accent-500 text-white"
                  : "border-paper-300"
              }`}
            >
              {active && <Check size={12} strokeWidth={3} />}
            </span>
            <span className="flex-1">{option}</span>
          </button>
        );
      })}
    </div>
  );
}
