import type { ReactNode } from "react";

// Four roles, decided after auditing every heading/title usage in the app (Build Order step 71):
// `brand` is the login page's wordmark specifically, not a generic page heading — kept distinct
// the same way brand identity is kept separate from UI chrome throughout this app. `page` is the
// generic top-level page heading (Workspaces, error/not-found, vault-reset). `content-large` and
// `content-compact` are two legitimate content-title tiers by container width, not an arbitrary
// split — a full writing-surface title (PageEditor, the share page) versus a compact panel title
// (CanvasEditor's toolbar-style header, CredentialDetail's narrower panel). `HEADING_CLASSES` is
// exported so PageEditor.tsx/CanvasEditor.tsx can apply the same values to their title <input>s
// directly — those are editable form fields, not static heading tags, so they can't go through the
// <Heading> component itself.
export type HeadingLevel = "brand" | "page" | "content-large" | "content-compact";

export const HEADING_CLASSES: Record<HeadingLevel, string> = {
  brand: "text-4xl font-semibold tracking-tight text-ink-800",
  page: "text-2xl font-semibold text-ink-800",
  "content-large": "text-4xl font-bold leading-snug text-ink-800",
  "content-compact": "text-2xl font-bold leading-snug text-ink-800",
};

export function Heading({
  level,
  as: Component = "h1",
  className = "",
  children,
}: {
  level: HeadingLevel;
  as?: "h1" | "h2";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Component className={`${HEADING_CLASSES[level]} ${className}`}>
      {children}
    </Component>
  );
}
