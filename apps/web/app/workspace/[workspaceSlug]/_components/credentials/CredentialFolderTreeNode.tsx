"use client";

import { memo, useCallback, type RefObject } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  KeyRound,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { Credential, CredentialFolder } from "@delft/types";

// Shared between this file's own nested credentials and CredentialList.tsx's root-level ones, so
// a leaf row looks identical regardless of depth.
export function CredentialLeafRow({
  credential,
  selectedId,
  onSelect,
  depth,
}: {
  credential: Credential;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const isSelected = selectedId === credential.id;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(credential.id)}
        style={{ paddingLeft: depth * 14 + 4 }}
        className={`flex w-full items-center gap-2 border-l-2 py-1.5 pr-2 text-left text-sm ${
          isSelected
            ? "border-accent-500 bg-paper-100 font-medium text-ink-800"
            : "border-transparent text-ink-700 hover:bg-paper-50"
        }`}
      >
        <KeyRound size={13} className="shrink-0 text-ink-400" />
        <span className="min-w-0 flex-1 truncate">
          {credential.title || "Untitled"}
        </span>
      </button>
    </li>
  );
}

export interface CredentialFolderTreeNodeProps {
  folder: CredentialFolder;
  foldersByParent: Map<string | null, CredentialFolder[]>;
  credentialsByFolder: Map<string | null, Credential[]>;
  expanded: Set<string>;
  // Ids that can't be a valid drop target for whatever folder is currently being dragged (its own
  // id plus every descendant) — computed once per drag session, see CredentialList.tsx. Empty when
  // nothing is being dragged.
  excludedDropIds: Set<string>;
  onToggle: (folderId: string) => void;
  onCreateSubfolder: (parentFolderId: string) => void;
  onCreateCredential: (folderId: string) => void;
  selectedId: string | null;
  onSelectCredential: (id: string) => void;
  renamingFolderId: string | null;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  renameInputRef: RefObject<HTMLInputElement | null>;
  onStartRename: (folder: CredentialFolder) => void;
  onDelete: (folder: CredentialFolder) => void;
  depth: number;
}

// Mirrors PageTreeNode.tsx's shape (same indentation formula, same hover-reveal pattern) — the one
// difference is a folder here can hold two kinds of children instead of one: more folders
// (recursed as more tree nodes) and credentials (rendered as plain leaf rows, no expand toggle).
function CredentialFolderTreeNodeImpl({
  folder,
  foldersByParent,
  credentialsByFolder,
  expanded,
  excludedDropIds,
  onToggle,
  onCreateSubfolder,
  onCreateCredential,
  selectedId,
  onSelectCredential,
  renamingFolderId,
  renameValue,
  onRenameChange,
  onCommitRename,
  onCancelRename,
  renameInputRef,
  onStartRename,
  onDelete,
  depth,
}: CredentialFolderTreeNodeProps) {
  const subFolders = foldersByParent.get(folder.id) ?? [];
  const ownCredentials = credentialsByFolder.get(folder.id) ?? [];
  const hasChildren = subFolders.length > 0 || ownCredentials.length > 0;
  const isExpanded = expanded.has(folder.id);
  const isRenaming = renamingFolderId === folder.id;

  // Row is both the drag source and a drop target — same pattern/rationale as PageTreeNode.tsx.
  const {
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: folder.id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: folder.id,
    disabled: excludedDropIds.has(folder.id),
  });
  const setRowRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );
  const isValidDropTarget = isOver && !excludedDropIds.has(folder.id);

  return (
    <li>
      {isRenaming ? (
        <input
          ref={renameInputRef}
          maxLength={200}
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename();
            if (e.key === "Escape") onCancelRename();
          }}
          style={{ paddingLeft: depth * 14 + 4 }}
          className="w-full py-1 text-sm text-ink-800 outline-none"
        />
      ) : (
        <div
          ref={setRowRef}
          {...listeners}
          className={`group flex items-center gap-1 rounded-md py-1 pr-1 text-sm text-ink-700 hover:bg-paper-100 ${
            isDragging ? "opacity-40" : ""
          } ${isValidDropTarget ? "bg-paper-200 ring-2 ring-inset ring-accent-500" : ""}`}
          style={{ paddingLeft: depth * 14 + 4 }}
        >
          <button
            type="button"
            onClick={() => onToggle(folder.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center text-ink-400 ${
                hasChildren ? "" : "invisible"
              }`}
            >
              {isExpanded ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )}
            </span>
            <Folder size={14} className="shrink-0 text-ink-400" />
            <span className="min-w-0 flex-1 truncate font-medium">
              {folder.name || "Untitled"}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-0.5 md:hidden md:group-hover:flex">
            <button
              type="button"
              onClick={() => onCreateSubfolder(folder.id)}
              aria-label="New subfolder"
              title="New subfolder"
              className="rounded-md p-1.5 text-ink-400 hover:bg-paper-200 hover:text-ink-800"
            >
              <FolderPlus size={13} />
            </button>
            <button
              type="button"
              onClick={() => onCreateCredential(folder.id)}
              aria-label="New credential"
              title="New credential"
              className="rounded-md p-1.5 text-ink-400 hover:bg-paper-200 hover:text-ink-800"
            >
              <Plus size={13} />
            </button>
            <button
              type="button"
              onClick={() => onStartRename(folder)}
              aria-label="Rename folder"
              title="Rename"
              className="rounded-md p-1.5 text-ink-400 hover:bg-paper-200 hover:text-ink-800"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(folder)}
              aria-label="Delete folder"
              title="Delete"
              className="rounded-md p-1.5 text-ink-400 hover:bg-paper-200 hover:text-red-700"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}
      {hasChildren && isExpanded && (
        <ul>
          {subFolders.map((sub) => (
            <CredentialFolderTreeNode
              key={sub.id}
              folder={sub}
              foldersByParent={foldersByParent}
              credentialsByFolder={credentialsByFolder}
              expanded={expanded}
              excludedDropIds={excludedDropIds}
              onToggle={onToggle}
              onCreateSubfolder={onCreateSubfolder}
              onCreateCredential={onCreateCredential}
              selectedId={selectedId}
              onSelectCredential={onSelectCredential}
              renamingFolderId={renamingFolderId}
              renameValue={renameValue}
              onRenameChange={onRenameChange}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              renameInputRef={renameInputRef}
              onStartRename={onStartRename}
              onDelete={onDelete}
              depth={depth + 1}
            />
          ))}
          {ownCredentials.map((credential) => (
            <CredentialLeafRow
              key={credential.id}
              credential={credential}
              selectedId={selectedId}
              onSelect={onSelectCredential}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function areCredentialFolderTreeNodePropsEqual(
  prev: CredentialFolderTreeNodeProps,
  next: CredentialFolderTreeNodeProps,
): boolean {
  return (
    prev.folder === next.folder &&
    prev.foldersByParent === next.foldersByParent &&
    prev.credentialsByFolder === next.credentialsByFolder &&
    prev.expanded === next.expanded &&
    prev.excludedDropIds === next.excludedDropIds &&
    prev.onToggle === next.onToggle &&
    prev.onCreateSubfolder === next.onCreateSubfolder &&
    prev.onCreateCredential === next.onCreateCredential &&
    prev.selectedId === next.selectedId &&
    prev.onSelectCredential === next.onSelectCredential &&
    prev.renamingFolderId === next.renamingFolderId &&
    prev.renameValue === next.renameValue &&
    prev.onRenameChange === next.onRenameChange &&
    prev.onCommitRename === next.onCommitRename &&
    prev.onCancelRename === next.onCancelRename &&
    prev.renameInputRef === next.renameInputRef &&
    prev.onStartRename === next.onStartRename &&
    prev.onDelete === next.onDelete &&
    prev.depth === next.depth
    // `expanded` IS compared here (unlike an earlier version of this file) — excluding it broke
    // toggling for any folder whose own isExpanded doesn't change but a NESTED subfolder's does:
    // the subfolder's isExpanded is only ever recomputed by its direct parent's render, so skipping
    // the parent's re-render (because the parent's own isExpanded looked unchanged) left nested
    // folders stuck on stale expand state — reported as "can't expand/collapse a subfolder." See
    // PageTreeNode.tsx's matching fix and comment for the same bug in the pages sidebar.
  );
}

export const CredentialFolderTreeNode = memo(
  CredentialFolderTreeNodeImpl,
  areCredentialFolderTreeNodePropsEqual,
);
CredentialFolderTreeNodeImpl.displayName = "CredentialFolderTreeNode";
