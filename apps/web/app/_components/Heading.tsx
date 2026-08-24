import type { ReactNode } from "react";

// One level for now (the login page's wordmark) — Phase B of the visual/layout redesign audits
// every other top-level heading and content-title usage in the app (currently 5 different
// size/weight combos for conceptually the same role) and adds the rest of the scale here. Adding
// levels speculatively ahead of that audit would just be guessing at values Phase B is meant to
// deliberately choose.
export type HeadingLevel = "page";

const LEVEL_CLASSES: Record<HeadingLevel, string> = {
  page: "text-4xl font-semibold tracking-tight text-ink-800",
};

export function Heading({
  level = "page",
  as: Component = "h1",
  className = "",
  children,
}: {
  level?: HeadingLevel;
  as?: "h1" | "h2";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Component className={`${LEVEL_CLASSES[level]} ${className}`}>
      {children}
    </Component>
  );
}
