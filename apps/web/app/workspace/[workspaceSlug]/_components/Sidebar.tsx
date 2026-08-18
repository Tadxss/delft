"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronsLeft, Plus } from "lucide-react";
import type { Page } from "@delft/types";
import { useCreateCanvas, useCreatePage, useCanvases, usePages, parseWorkspaceSlug } from "@delft/shared";
import { PageTreeNode } from "./PageTreeNode";

// Fetches the whole workspace's pages in one query and builds the parent_id tree client-side —
// simpler than a query-per-expand for a personal-scale page count, and lets the whole tree be
// searched/filtered later without extra round-trips.
export function Sidebar({ onCollapse }: { onCollapse: () => void }) {
  const params = useParams<{ workspaceSlug: string; canvasId?: string }>();
  const workspaceId = parseWorkspaceSlug(params.workspaceSlug);
  const router = useRouter();
  const { data: pages, isLoading, isError: pagesError, error: pagesErrorObj } = usePages(workspaceId);
  const {
    data: canvases,
    isLoading: canvasesLoading,
    isError: canvasesError,
    error: canvasesErrorObj,
  } = useCanvases(workspaceId);
  const createPage = useCreatePage();
  const createCanvas = useCreateCanvas();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, Page[]>();
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
      { onSuccess: (canvas) => router.push(`/workspace/${params.workspaceSlug}/canvas/${canvas.id}`) },
    );
  }

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
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-500">Pages</span>
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
      </div>
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
          {roots.map((page) => (
            <PageTreeNode
              key={page.id}
              page={page}
              childrenByParent={childrenByParent}
              expanded={expanded}
              onToggle={toggle}
              onCreateChild={createChild}
              depth={0}
            />
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-500">Canvas</span>
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
        <ul className="flex flex-col gap-0.5">
          {(canvases ?? []).map((canvas) => (
            <li key={canvas.id}>
              <Link
                href={`/workspace/${params.workspaceSlug}/canvas/${canvas.id}`}
                className={`block truncate rounded-md px-1 py-1 text-sm hover:bg-paper-100 ${
                  params.canvasId === canvas.id
                    ? "bg-paper-100 font-medium text-ink-800"
                    : "text-ink-600"
                }`}
              >
                {canvas.title || "Untitled"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
