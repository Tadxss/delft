// Shared by every reorderable list (pages, credential folders, credentials, canvases) — both
// drag-and-drop interactions (reparent-onto-a-row, reorder-onto-a-strip) resolve the dropped item's
// new `position` through one of these two functions rather than each tree computing its own.

// Insert strictly between two ordered neighbors — either may be absent (start/end of the list).
export function computeReorderPosition(
  before: number | null,
  after: number | null,
): number {
  if (before === null && after === null) return 0;
  if (before === null) return after! - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

// Append as the new last sibling — used when a drag lands ON a row (reparent), not on a specific
// reorder strip, matching the existing "append at the end" reparent behavior.
export function computeAppendPosition(siblings: { position: number }[]): number {
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((s) => s.position)) + 1;
}
