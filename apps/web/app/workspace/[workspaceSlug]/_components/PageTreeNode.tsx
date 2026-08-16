"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import type { Page } from "@delft/types";
import { parseWorkspaceSlug, useDeletePage, useUpdatePage } from "@delft/shared";

export interface PageTreeNodeProps {
  page: Page;
  childrenByParent: Map<string | null, Page[]>;
  expanded: Set<string>;
  onToggle: (pageId: string) => void;
  onCreateChild: (parentId: string) => void;
  depth: number;
}

export function PageTreeNode({
  page,
  childrenByParent,
  expanded,
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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
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
        className={`group flex items-center gap-1 rounded-md px-1 py-1 text-sm hover:bg-paper-100 ${
          isActive ? "bg-paper-100 font-medium text-ink-800" : "text-ink-600"
        }`}
        style={{ paddingLeft: depth * 14 + 4 }}
      >
        <button
          type="button"
          onClick={() => onToggle(page.id)}
          aria-label={isExpanded ? "Collapse" : "Expand"}
          className={`flex h-4 w-4 shrink-0 items-center justify-center text-ink-400 ${
            hasChildren
              ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              : "invisible"
          }`}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {renaming ? (
          <input
            ref={renameInputRef}
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
          className="hidden h-4 w-4 shrink-0 items-center justify-center text-ink-400 hover:text-ink-700 group-hover:flex group-focus-within:flex"
        >
          <Plus size={14} />
        </button>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Page actions"
            aria-haspopup="menu"
            className="hidden h-4 w-4 shrink-0 items-center justify-center text-ink-400 hover:text-ink-700 group-hover:flex group-focus-within:flex"
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
