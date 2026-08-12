"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

// Renders nothing until mounted — `resolvedTheme` is undefined on the server/first client render
// (next-themes doesn't know the user's preference yet), and guessing wrong here would flash the
// opposite icon before hydration settles.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-6 w-6" />;

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-6 w-6 items-center justify-center rounded text-ink-500 hover:bg-paper-100 hover:text-ink-800"
    >
      {isDark ? "☀" : "☾"}
    </button>
  );
}
