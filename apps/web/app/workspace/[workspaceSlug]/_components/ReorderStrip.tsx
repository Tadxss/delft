"use client";

import { useDroppable } from "@dnd-kit/core";

// A thin, always-mounted drop target rendered between every pair of siblings in a reorderable list
// (pages, credential folders, credentials, canvases) — dropping here reorders/reparents the dragged
// item to this exact position, distinct from dropping ON a row (which reparents it as that row's
// child, appended at the end — see PageTreeNode.tsx/CredentialFolderTreeNode.tsx).
//
// The wrapping <li> has ZERO height — same "must never shift layout" lesson CredentialList.tsx's
// RootDropStrip learned the hard way (toggling a drop target's height mid-drag moves every row below
// it, which moves the drop target out from under the cursor before the pointer coordinates driving
// collision detection have caught up). Here that's enforced structurally instead of via a constant
// fixed height: the hit area and visible line both live in an absolutely-positioned child, so they
// never participate in list layout at all, dragging or not.
export function ReorderStrip({ id, active }: { id: string; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <li className="relative h-0 list-none" aria-hidden="true">
      <div
        ref={setNodeRef}
        className={`absolute inset-x-1 -top-1.5 -bottom-1.5 z-20 ${active ? "" : "pointer-events-none"}`}
      >
        {/* Thicker + glowing (not just a flat 2px line) specifically so it still reads clearly
            next to the DragOverlay ghost — the ghost is offset away from the cursor (see
            dragOverlayOffset.ts) but can still land nearby, and a plain hairline was easy to miss
            against it. */}
        <div
          className={`mt-1 rounded-full transition-all ${
            isOver
              ? "h-1 bg-accent-500 shadow-[0_0_0_3px_rgba(0,0,0,0.06)]"
              : "h-0.5"
          }`}
        />
      </div>
    </li>
  );
}
