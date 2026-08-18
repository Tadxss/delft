"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import type { Page } from "@delft/types";
import {
  parseWorkspaceSlug,
  useDeletePage,
  useUpdatePage,
} from "@delft/shared";

export interface PageTreeNodeProps {
  page: Page;
  childrenByParent: Map<string | null, Page[]>;
  expanded: Set<string>;
  // Ids that can't be a valid drop target for whatever page is currently being dragged (its own id
  // plus every descendant) — computed once per drag session, see Sidebar.tsx. Empty when nothing is
  // being dragged.
  excludedDropIds: Set<string>;
  onToggle: (pageId: string) => void;
  onCreateChild: (parentId: string) => void;
  depth: number;
}

function PageTreeNodeImpl({
  page,
  childrenByParent,
  expanded,
  excludedDropIds,
  onToggle,
  onCreateChild,
  depth,
}: PageTreeNodeProps) {
  const params = useParams<{ workspaceSlug: string; pageId?: string }>();
  const router = useRouter();
  const workspaceId = parseWorkspaceSlug(params.workspaceSlug);
  const updatePage = useUpdatePage();
  const deletePage = useDeletePage();
  const children = childrenByParent.get(page.id) ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(page.id);
  const isActive = params.pageId === page.id;

  // Row is both the drag source (grab any page to move it) and a drop target (drop another page
  // onto it to reparent). `listeners` alone (not `attributes`, which adds a role="button"/tabIndex
  // meant for a keyboard-drag story this app doesn't implement) goes on the row — see Sidebar.tsx
  // for the PointerSensor's delay+tolerance activation constraint that keeps ordinary clicks on the
  // Link/buttons below working normally.
  const {
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: page.id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: page.id,
    disabled: excludedDropIds.has(page.id),
  });
  const setRowRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );
  const isValidDropTarget = isOver && !excludedDropIds.has(page.id);

  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(page.title);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function startRename() {
    setTitle(page.title);
    setRenaming(true);
    setMenuOpen(false);
  }

  function commitRename() {
    const trimmed = title.trim();
    if (trimmed && trimmed !== page.title) {
      updatePage.mutate({ id: page.id, title: trimmed });
    }
    setRenaming(false);
  }

  function cancelRename() {
    setTitle(page.title);
    setRenaming(false);
  }

  function handleDelete() {
    setMenuOpen(false);
    if (!window.confirm("Delete this page and all of its sub-pages?")) return;
    deletePage.mutate(
      { id: page.id, workspaceId },
      {
        onSuccess: () => {
          if (isActive) router.push(`/workspace/${params.workspaceSlug}`);
        },
      },
    );
  }

  return (
    <li>
      <div
        ref={setRowRef}
        {...listeners}
        className={`group flex items-center gap-1 rounded-md px-1 py-1 text-sm hover:bg-paper-100 ${
          isActive ? "bg-paper-100 font-medium text-ink-800" : "text-ink-600"
        } ${isDragging ? "opacity-40" : ""} ${
          isValidDropTarget
            ? "bg-paper-200 ring-2 ring-inset ring-accent-500"
            : ""
        }`}
        style={{ paddingLeft: depth * 14 + 4 }}
      >
        <button
          type="button"
          onClick={() => onToggle(page.id)}
          aria-label={isExpanded ? "Collapse" : "Expand"}
          className={`relative flex h-4 w-4 shrink-0 items-center justify-center text-ink-400 before:absolute before:-left-2 before:-right-1 before:-top-1.5 before:-bottom-1.5 before:content-[''] ${
            hasChildren
              ? "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
              : "invisible"
          }`}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {renaming ? (
          <input
            ref={renameInputRef}
            maxLength={500}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelRename();
              }
            }}
            className="min-w-0 flex-1 rounded border border-accent-500 bg-paper-50 px-1 text-sm text-ink-800 outline-none"
          />
        ) : (
          <Link
            href={`/workspace/${params.workspaceSlug}/p/${page.id}`}
            className="min-w-0 flex-1 truncate"
          >
            {page.title || "Untitled"}
          </Link>
        )}
        <button
          type="button"
          onClick={() => onCreateChild(page.id)}
          aria-label="Add sub-page"
          className="relative flex h-4 w-4 shrink-0 items-center justify-center text-ink-400 before:absolute before:-left-1 before:-right-0.5 before:-top-1.5 before:-bottom-1.5 before:content-[''] hover:text-ink-700 md:hidden md:group-hover:flex md:group-focus-within:flex"
        >
          <Plus size={14} />
        </button>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Page actions"
            aria-haspopup="menu"
            className="relative flex h-4 w-4 shrink-0 items-center justify-center text-ink-400 before:absolute before:-left-0.5 before:-right-2.5 before:-top-1.5 before:-bottom-1.5 before:content-[''] hover:text-ink-700 md:hidden md:group-hover:flex md:group-focus-within:flex"
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-10 mt-1 w-32 rounded-md border border-paper-200 bg-paper-50 py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={startRename}
                className="block w-full px-3 py-1.5 text-left text-sm text-ink-600 hover:bg-paper-100 hover:text-ink-800"
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleDelete}
                className="block w-full px-3 py-1.5 text-left text-sm text-red-700 hover:bg-paper-100"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      {hasChildren && isExpanded && (
        <ul>
          {children.map((child) => (
            <PageTreeNode
              key={child.id}
              page={child}
              childrenByParent={childrenByParent}
              expanded={expanded}
              excludedDropIds={excludedDropIds}
              onToggle={onToggle}
              onCreateChild={onCreateChild}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function arePageTreeNodePropsEqual(
  prev: PageTreeNodeProps,
  next: PageTreeNodeProps,
): boolean {
  return (
    prev.page === next.page &&
    prev.childrenByParent === next.childrenByParent &&
    prev.expanded === next.expanded &&
    prev.excludedDropIds === next.excludedDropIds &&
    prev.onToggle === next.onToggle &&
    prev.onCreateChild === next.onCreateChild &&
    prev.depth === next.depth
    // `expanded` IS compared here (unlike an earlier version of this file) — excluding it broke
    // toggling for any node whose own isExpanded doesn't change but a NESTED descendant's does: the
    // descendant's isExpanded is only ever recomputed by its direct parent's render, so skipping the
    // parent's re-render (because the parent's own isExpanded looked unchanged) left descendants
    // stuck on stale expand state. Comparing `expanded` normally means a toggle anywhere re-renders
    // the whole tree again, same as before any memoization existed — correct behavior over a
    // perf optimization that doesn't matter yet at this app's scale.
  );
}

export const PageTreeNode = memo(PageTreeNodeImpl, arePageTreeNodePropsEqual);
PageTreeNodeImpl.displayName = "PageTreeNode";
