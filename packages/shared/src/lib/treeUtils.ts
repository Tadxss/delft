// Generic "which ids can't be a valid drop/move target for this item" helper, shared by the pages
// sidebar and the credentials folder tree's drag-and-drop reparenting — an item obviously can't
// become its own parent, and moving it into one of its own descendants would create a cycle.
// Server-side triggers (pages_check_parent / credential_folders_check_parent) are the real
// enforcement; this is purely so the UI never even offers an invalid target as droppable.
export function computeSubtreeIds<T extends { id: string }>(
  rootId: string,
  items: T[],
  getParentId: (item: T) => string | null,
): Set<string> {
  const excluded = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const item of items) {
      const parentId = getParentId(item);
      if (parentId && excluded.has(parentId) && !excluded.has(item.id)) {
        excluded.add(item.id);
        added = true;
      }
    }
  }
  return excluded;
}
