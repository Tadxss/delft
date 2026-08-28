import type { Workspace } from "@crowscribe/types";

// Lowercase, strip anything that isn't alphanumeric to a single "-", trim leading/trailing "-".
// Guaranteed never to contain "--" (repeated separators collapse to one), which is what makes the
// "--" join below unambiguous to split back apart.
export function slugifyWorkspaceName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "workspace";
}

// `/workspace/{slug}--{id}` — human-readable name up front so the URL doesn't read as an internal
// id, but the real id is always present after the "--" so links never break if the workspace is
// later renamed (the slug segment is purely decorative, never looked up against).
export function buildWorkspaceHref(
  workspace: Pick<Workspace, "id" | "name">,
): string {
  return `/workspace/${slugifyWorkspaceName(workspace.name)}--${workspace.id}`;
}

// Up-to-two-letter initials for the logo-less fallback badge. Two or more words → first letter of
// each of the first two; one word → its first two letters; nothing usable → "?".
export function workspaceInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

// Recovers the workspace id from a `{slug}--{id}` route param. Falls back to treating the whole
// param as the id if no "--" is present, so a bare id (e.g. an old/manually-typed link) still
// works rather than 404ing.
export function parseWorkspaceSlug(param: string): string {
  const parts = param.split("--");
  return parts.length > 1 ? parts[parts.length - 1]! : param;
}
