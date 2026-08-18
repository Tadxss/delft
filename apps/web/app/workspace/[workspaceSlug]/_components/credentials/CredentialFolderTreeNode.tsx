"use client";

import { memo, type RefObject } from "react";
import type { Credential, CredentialFolder } from "@delft/types";

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 5a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 20h9" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 9l-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 5l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12h20" strokeLinecap="round" />
      <path d="M15 19l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 6h18" strokeLinecap="round" />
      <path
        d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderPlusIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="M3 5a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 11v4M10 13h4" strokeLinecap="round" />
    </svg>
  );
}

function CredentialPlusIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 10v5M9.5 12.5h5" strokeLinecap="round" />
    </svg>
  );
}

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
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(credential.id)}
        style={{ paddingLeft: depth * 14 + 4 }}
        className={`flex w-full items-center gap-2 py-1 pr-2 text-left text-sm ${
          selectedId === credential.id
            ? "bg-paper-100 text-ink-800"
            : "text-ink-700 hover:bg-paper-50"
        }`}
      >
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
  // Kept for the recursive sub-folder map below — deliberately excluded from
  // areCredentialFolderTreeNodePropsEqual, same rationale as PageTreeNode.tsx.
  expanded: Set<string>;
  isExpanded: boolean;
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
  onMove: (folder: CredentialFolder) => void;
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
  isExpanded,
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
  onMove,
  onDelete,
  depth,
}: CredentialFolderTreeNodeProps) {
  const subFolders = foldersByParent.get(folder.id) ?? [];
  const ownCredentials = credentialsByFolder.get(folder.id) ?? [];
  const hasChildren = subFolders.length > 0 || ownCredentials.length > 0;
  const isRenaming = renamingFolderId === folder.id;

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
          className="group flex items-center gap-1 rounded-md py-1 pr-1 text-sm text-ink-700 hover:bg-paper-100"
          style={{ paddingLeft: depth * 14 + 4 }}
        >
          <button
            type="button"
            onClick={() => onToggle(folder.id)}
            className="flex min-w-0 flex-1 items-center gap-1 text-left"
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-ink-400 ${
                hasChildren ? "" : "invisible"
              }`}
            >
              {isExpanded ? "▾" : "▸"}
            </span>
            <FolderIcon />
            <span className="min-w-0 flex-1 truncate">
              {folder.name || "Untitled"}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-0.5 md:hidden md:group-hover:flex">
            <button
              type="button"
              onClick={() => onCreateSubfolder(folder.id)}
              aria-label="New subfolder"
              title="New subfolder"
              className="rounded p-1 text-ink-400 hover:bg-paper-200 hover:text-ink-700"
            >
              <FolderPlusIcon />
            </button>
            <button
              type="button"
              onClick={() => onCreateCredential(folder.id)}
              aria-label="New credential"
              title="New credential"
              className="rounded p-1 text-ink-400 hover:bg-paper-200 hover:text-ink-700"
            >
              <CredentialPlusIcon />
            </button>
            <button
              type="button"
              onClick={() => onStartRename(folder)}
              aria-label="Rename folder"
              title="Rename"
              className="rounded p-1 text-ink-400 hover:bg-paper-200 hover:text-ink-700"
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              onClick={() => onMove(folder)}
              aria-label="Move folder"
              title="Move"
              className="rounded p-1 text-ink-400 hover:bg-paper-200 hover:text-ink-700"
            >
              <MoveIcon />
            </button>
            <button
              type="button"
              onClick={() => onDelete(folder)}
              aria-label="Delete folder"
              title="Delete"
              className="rounded p-1 text-ink-400 hover:bg-paper-200 hover:text-red-700"
            >
              <TrashIcon />
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
              isExpanded={expanded.has(sub.id)}
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
              onMove={onMove}
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
    prev.isExpanded === next.isExpanded &&
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
    prev.onMove === next.onMove &&
    prev.onDelete === next.onDelete &&
    prev.depth === next.depth
    // `expanded` (the raw Set) is deliberately excluded — same rationale as PageTreeNode.tsx.
  );
}

export const CredentialFolderTreeNode = memo(
  CredentialFolderTreeNodeImpl,
  areCredentialFolderTreeNodePropsEqual,
);
CredentialFolderTreeNodeImpl.displayName = "CredentialFolderTreeNode";
