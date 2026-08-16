"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import type { Page } from "@delft/types";

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
  const children = childrenByParent.get(page.id) ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(page.id);
  const isActive = params.pageId === page.id;

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
        <Link
          href={`/workspace/${params.workspaceSlug}/p/${page.id}`}
          className="min-w-0 flex-1 truncate"
        >
          {page.title || "Untitled"}
        </Link>
        <button
          type="button"
          onClick={() => onCreateChild(page.id)}
          aria-label="Add sub-page"
          className="hidden h-4 w-4 shrink-0 items-center justify-center text-ink-400 hover:text-ink-700 group-hover:flex group-focus-within:flex"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            // TODO: open a rename/delete/move menu here once those actions exist.
            console.log("page menu:", page.id);
          }}
          aria-label="Page actions"
          aria-haspopup="menu"
          className="hidden h-4 w-4 shrink-0 items-center justify-center text-ink-400 hover:text-ink-700 group-hover:flex group-focus-within:flex"
        >
          <MoreHorizontal size={14} />
        </button>
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
