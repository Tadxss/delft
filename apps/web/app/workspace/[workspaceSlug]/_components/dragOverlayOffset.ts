import type { DropAnimation, Modifier } from "@dnd-kit/core";
import { defaultDropAnimationSideEffects } from "@dnd-kit/core";

// Shifts the DragOverlay ghost away from the actual cursor position. Without this, the ghost tracks
// the pointer 1:1 and sits directly on top of whatever row/strip is under it — exactly the thing a
// user is trying to look at to see where the drop will land (a ReorderStrip's thin highlighted
// line, or a row's own drop-target ring). Offsetting the ghost down-and-right keeps it visible as a
// reference to *what's* being dragged while leaving the actual target uncovered, the same reason
// most drag-and-drop UIs (Trello, Notion) render their ghost as a small tag near, not under, the
// cursor rather than centered on it.
export const offsetDragOverlay: Modifier = ({ transform }) => ({
  ...transform,
  x: transform.x + 16,
  y: transform.y + 28,
});

// Shared `<DragOverlay dropAnimation={...}>` config, snappier than dnd-kit's default (250ms
// "ease") — every overlay in this app is a small pill/row, not a large element, so a shorter,
// more decisive settle reads better than the default's slightly floaty timing.
export const dragOverlayDropAnimation: DropAnimation = {
  duration: 180,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};
