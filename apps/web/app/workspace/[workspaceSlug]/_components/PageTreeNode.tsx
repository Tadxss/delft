"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
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
          className={`flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-ink-400 ${
            hasChildren ? "" : "invisible"
          }`}
        >
          {isExpanded ? "▾" : "▸"}
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
          className="hidden h-4 w-4 shrink-0 items-center justify-center text-ink-400 hover:text-ink-700 group-hover:flex"
        >
          +
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
