"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronsLeft, Plus } from "lucide-react";
import type { CanvasSummary, PageSummary } from "@delft/types";
import {
  canvasQueryOptions,
  useCreateCanvas,
  useCreatePage,
  useCanvases,
  usePages,
  useSupabaseClient,
  useUpdateCanvas,
  useUpdatePage,
  parseWorkspaceSlug,
  computeSubtreeIds,
  computeAppendPosition,
  computeReorderPosition,
} from "@delft/shared";
import { PageTreeNode } from "./PageTreeNode";
import { ReorderStrip } from "./ReorderStrip";
import { offsetDragOverlay } from "./dragOverlayOffset";

// The "Pages" section header, wrapped in its own component so useDroppable can be called on it —
// it needs to render as a descendant of Sidebar's own <DndContext>, which a hook call directly in
// Sidebar's body can't do (Sidebar's function body isn't itself "inside" the provider it returns).
function PagesRootDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "pages-root" });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-between rounded-md px-1 ${
        isOver ? "bg-paper-200 ring-2 ring-inset ring-accent-500" : ""
      }`}
    >
      {children}
    </div>
  );
}

// A draggable canvas link — canvases are a flat list (no folders to reparent into), so this only
// ever needs to be a drag *source*; reordering happens entirely via the ReorderStrips between rows,
// not by dropping onto another canvas. Listeners go on the wrapping div, not the Link itself, same
// reasoning as PageTreeNode.tsx's row: keeps ordinary clicks navigating normally.
function CanvasRow({
  canvas,
  href,
  isActive,
}: {
  canvas: CanvasSummary;
  href: string;
  isActive: boolean;
}) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: canvas.id,
  });
  const queryClient = useQueryClient();
  const supabase = useSupabaseClient();
  // Same rationale as PageTreeNode.tsx's prefetch — warms the canvas content cache on hover/focus,
  // before the click, so opening it feels instant.
  const prefetch = useCallback(() => {
    queryClient.prefetchQuery(canvasQueryOptions(supabase, canvas.id));
  }, [queryClient, supabase, canvas.id]);
  return (
    <li>
      <div ref={setNodeRef} {...listeners} className={isDragging ? "opacity-40" : ""}>
        <Link
          href={href}
          onMouseEnter={prefetch}
          onFocus={prefetch}
          className={`block truncate rounded-md px-1 py-1 text-sm hover:bg-paper-100 ${
            isActive ? "bg-paper-100 font-medium text-ink-800" : "text-ink-600"
          }`}
        >
          {canvas.title || "Untitled"}
        </Link>
      </div>
    </li>
  );
}

// Fetches the whole workspace's pages in one query and builds the parent_id tree client-side —
// simpler than a query-per-expand for a personal-scale page count, and lets the whole tree be
// searched/filtered later without extra round-trips.
export function Sidebar({ onCollapse }: { onCollapse: () => void }) {
  const params = useParams<{ workspaceSlug: string; canvasId?: string }>();
  const workspaceId = parseWorkspaceSlug(params.workspaceSlug);
  const router = useRouter();
  const {
    data: pages,
    isLoading,
    isError: pagesError,
    error: pagesErrorObj,
  } = usePages(workspaceId);
  const {
    data: canvases,
    isLoading: canvasesLoading,
    isError: canvasesError,
    error: canvasesErrorObj,
  } = useCanvases(workspaceId);
  const createPage = useCreatePage();
  const createCanvas = useCreateCanvas();
  const updatePage = useUpdatePage();
  const updateCanvas = useUpdateCanvas();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [excludedDropIds, setExcludedDropIds] = useState<Set<string>>(
    new Set(),
  );
  const [dragError, setDragError] = useState<string | null>(null);
  const [draggingCanvasId, setDraggingCanvasId] = useState<string | null>(
    null,
  );
  const [canvasDragError, setCanvasDragError] = useState<string | null>(null);
  // Two sensors, not one PointerSensor for both: a delay-based constraint (needed on touch, so a
  // scroll swipe isn't immediately hijacked as a drag) makes mouse dragging feel broken, because it
  // requires holding the pointer still for the full delay before any movement is allowed — an
  // ordinary "click and immediately drag" gesture moves well before that, which cancels the drag
  // instead of starting it. Mouse gets a small distance threshold instead (drag starts the instant
  // the pointer moves a few px, no hold required — the click-vs-drag telling apart mouse-only
  // clicks already need); touch keeps the delay, since native scroll must stay possible there.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, PageSummary[]>();
    for (const page of pages ?? []) {
      const key = page.parentId;
      const list = map.get(key) ?? [];
      list.push(page);
      map.set(key, list);
    }
    return map;
  }, [pages]);

  const roots = childrenByParent.get(null) ?? [];

  const toggle = useCallback((pageId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }, []);

  const createChild = useCallback(
    (parentId: string | null) => {
      createPage.mutate(
        { workspaceId, parentId },
        {
          onSuccess: (page) => {
            if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
            router.push(`/workspace/${params.workspaceSlug}/p/${page.id}`);
          },
        },
      );
    },
    // createPage.mutate is a stable reference across renders (TanStack Query guarantee); the
    // wrapping createPage object isn't, so depending on it instead would give this callback a new
    // identity every render and defeat the memoization PageTreeNode relies on to skip re-rendering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspaceId, params.workspaceSlug, router, createPage.mutate],
  );

  function createNewCanvas() {
    createCanvas.mutate(
      { workspaceId },
      {
        onSuccess: (canvas) =>
          router.push(`/workspace/${params.workspaceSlug}/canvas/${canvas.id}`),
      },
    );
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setDraggingId(id);
    setExcludedDropIds(computeSubtreeIds(id, pages ?? [], (p) => p.parentId));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingId(null);
    setExcludedDropIds(new Set());
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (overId === activeId) return;

    const draggedPage = (pages ?? []).find((p) => p.id === activeId);
    if (!draggedPage) return;

    // Dropped on a reorder strip ("insert right after <anchor>, or at the start") — reorders within
    // (or reparents into, at an exact spot) whichever parent that strip belongs to. See
    // PageTreeNode.tsx's rendering of these ids for why the anchor is a sibling id, not an index.
    if (overId.startsWith("page-strip:")) {
      const rest = overId.slice("page-strip:".length);
      const sep = rest.indexOf(":");
      const parentKey = rest.slice(0, sep);
      const afterId = rest.slice(sep + 1);
      const targetParentId = parentKey === "root" ? null : parentKey;
      if (afterId === activeId) return; // dropped adjacent to itself — no-op

      if (targetParentId !== null) {
        const excluded = computeSubtreeIds(
          activeId,
          pages ?? [],
          (p) => p.parentId,
        );
        if (excluded.has(targetParentId)) return;
      }

      const siblings = (childrenByParent.get(targetParentId) ?? []).filter(
        (p) => p.id !== activeId,
      );
      const anchorIndex =
        afterId === "start" ? -1 : siblings.findIndex((p) => p.id === afterId);
      const before = anchorIndex >= 0 ? siblings[anchorIndex]!.position : null;
      const after = siblings[anchorIndex + 1]?.position ?? null;

      updatePage.mutate(
        {
          id: activeId,
          parentId: targetParentId,
          position: computeReorderPosition(before, after),
        },
        {
          onError: (e) => setDragError(e.message),
          onSuccess: () => setDragError(null),
        },
      );
      return;
    }

    // Dropped directly on a row/header — reparent, appended as the new last child.
    const targetParentId = overId === "pages-root" ? null : overId;
    if (targetParentId !== null) {
      const excluded = computeSubtreeIds(
        activeId,
        pages ?? [],
        (p) => p.parentId,
      );
      if (excluded.has(targetParentId)) return;
    }
    if (draggedPage.parentId === targetParentId) return;

    updatePage.mutate(
      {
        id: activeId,
        parentId: targetParentId,
        position: computeAppendPosition(
          childrenByParent.get(targetParentId) ?? [],
        ),
      },
      {
        onError: (e) => setDragError(e.message),
        onSuccess: () => setDragError(null),
      },
    );
  }

  const draggingPage = draggingId
    ? (pages ?? []).find((p) => p.id === draggingId)
    : null;

  function handleCanvasDragStart(event: DragStartEvent) {
    setDraggingCanvasId(String(event.active.id));
  }

  function handleCanvasDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingCanvasId(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (!overId.startsWith("canvas-strip:root:")) return;
    const afterId = overId.slice("canvas-strip:root:".length);
    if (afterId === activeId) return;

    const siblings = (canvases ?? []).filter((c) => c.id !== activeId);
    const anchorIndex =
      afterId === "start" ? -1 : siblings.findIndex((c) => c.id === afterId);
    const before = anchorIndex >= 0 ? siblings[anchorIndex]!.position : null;
    const after = siblings[anchorIndex + 1]?.position ?? null;

    updateCanvas.mutate(
      { id: activeId, position: computeReorderPosition(before, after) },
      {
        onError: (e) => setCanvasDragError(e.message),
        onSuccess: () => setCanvasDragError(null),
      },
    );
  }

  const draggingCanvas = draggingCanvasId
    ? (canvases ?? []).find((c) => c.id === draggingCanvasId)
    : null;

  return (
    <nav className="group flex h-full w-64 shrink-0 flex-col gap-2 border-r border-paper-200 bg-paper-50 p-3">
      <div className="flex items-center justify-end px-1">
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse sidebar"
          className="relative rounded px-1.5 py-0.5 text-ink-500 opacity-100 before:absolute before:-left-2 before:-right-2.5 before:-top-3 before:-bottom-1 before:content-[''] hover:bg-paper-100 hover:text-ink-800 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
        >
          <ChevronsLeft size={14} />
        </button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        modifiers={[offsetDragOverlay]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <PagesRootDropZone>
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Pages
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => createChild(null)}
              aria-label="New page"
              className="relative rounded px-1.5 py-0.5 text-ink-500 before:absolute before:-left-2 before:-right-2.5 before:-top-1 before:-bottom-1.5 before:content-[''] hover:bg-paper-100 hover:text-ink-800"
            >
              <Plus size={14} />
            </button>
          </div>
        </PagesRootDropZone>
        {dragError && (
          <p className="px-1 text-xs text-red-700">
            Couldn&apos;t move page: {dragError}
          </p>
        )}
        {isLoading ? (
          <p className="px-1 text-sm text-ink-400">Loading…</p>
        ) : pagesError ? (
          <p className="px-1 text-sm text-red-700">
            Couldn&apos;t load pages: {pagesErrorObj.message}
          </p>
        ) : roots.length === 0 ? (
          <p className="px-1 text-sm text-ink-400">No pages yet.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {roots.map((page, index) => (
              <Fragment key={page.id}>
                <ReorderStrip
                  id={`page-strip:root:${index === 0 ? "start" : roots[index - 1]!.id}`}
                  active={draggingId !== null}
                />
                <PageTreeNode
                  page={page}
                  childrenByParent={childrenByParent}
                  expanded={expanded}
                  excludedDropIds={excludedDropIds}
                  dragActive={draggingId !== null}
                  onToggle={toggle}
                  onCreateChild={createChild}
                  depth={0}
                />
              </Fragment>
            ))}
            <ReorderStrip
              id={`page-strip:root:${roots[roots.length - 1]!.id}`}
              active={draggingId !== null}
            />
          </ul>
        )}
        <DragOverlay>
          {draggingPage && (
            <div className="rounded-md border border-paper-200 bg-paper-50 px-2 py-1 text-sm text-ink-800 shadow-lg">
              {draggingPage.title || "Untitled"}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <div className="mt-2 flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Canvas
        </span>
        <button
          type="button"
          onClick={createNewCanvas}
          aria-label="New canvas"
          className="relative rounded px-1.5 py-0.5 text-ink-500 before:absolute before:-left-2 before:-right-2.5 before:-top-3 before:-bottom-2 before:content-[''] hover:bg-paper-100 hover:text-ink-800"
        >
          <Plus size={14} />
        </button>
      </div>
      {canvasesLoading ? (
        <p className="px-1 text-sm text-ink-400">Loading…</p>
      ) : canvasesError ? (
        <p className="px-1 text-sm text-red-700">
          Couldn&apos;t load canvases: {canvasesErrorObj.message}
        </p>
      ) : (canvases ?? []).length === 0 ? (
        <p className="px-1 text-sm text-ink-400">No canvases yet.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          modifiers={[offsetDragOverlay]}
          onDragStart={handleCanvasDragStart}
          onDragEnd={handleCanvasDragEnd}
        >
          {canvasDragError && (
            <p className="px-1 text-xs text-red-700">
              Couldn&apos;t move canvas: {canvasDragError}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {(canvases ?? []).map((canvas, index) => (
              <Fragment key={canvas.id}>
                <ReorderStrip
                  id={`canvas-strip:root:${index === 0 ? "start" : canvases![index - 1]!.id}`}
                  active={draggingCanvasId !== null}
                />
                <CanvasRow
                  canvas={canvas}
                  href={`/workspace/${params.workspaceSlug}/canvas/${canvas.id}`}
                  isActive={params.canvasId === canvas.id}
                />
              </Fragment>
            ))}
            <ReorderStrip
              id={`canvas-strip:root:${canvases![canvases!.length - 1]!.id}`}
              active={draggingCanvasId !== null}
            />
          </ul>
          <DragOverlay>
            {draggingCanvas && (
              <div className="rounded-md border border-paper-200 bg-paper-50 px-2 py-1 text-sm text-ink-800 shadow-lg">
                {draggingCanvas.title || "Untitled"}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </nav>
  );
}
