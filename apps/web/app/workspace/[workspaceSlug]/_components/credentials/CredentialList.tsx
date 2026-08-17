"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Credential, CredentialFolder } from "@delft/types";
import {
  useCreateCredentialFolder,
  useDeleteCredentialFolder,
  useUpdateCredentialFolder,
} from "@delft/shared";
import { MoveCredentialFolderModal } from "./MoveCredentialFolderModal";
import {
  CredentialFolderTreeNode,
  CredentialLeafRow,
} from "./CredentialFolderTreeNode";

function FolderPlusIcon() {
  return (
    <svg
      width="14"
      height="14"
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

function buildFolderMaps(folders: CredentialFolder[]) {
  const byParent = new Map<string | null, CredentialFolder[]>();
  const byId = new Map<string, CredentialFolder>();
  for (const folder of folders) {
    byId.set(folder.id, folder);
    const key = folder.parentFolderId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(folder);
  }
  return { byParent, byId };
}

function buildCredentialsByFolder(credentials: Credential[]) {
  const map = new Map<string | null, Credential[]>();
  for (const credential of credentials) {
    const key = credential.folderId;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(credential);
  }
  return map;
}

// Always-visible collapsible tree, mirroring Sidebar.tsx/PageTreeNode.tsx's design exactly (same
// expand/collapse model, same indentation, same hover-reveal actions) rather than the Finder-style
// drill-down this replaced — the two nested-tree features in this app now share one navigation
// pattern instead of two.
export function CredentialList({
  workspaceId,
  credentials,
  folders,
  selectedId,
  onSelect,
  onNewCredential,
}: {
  workspaceId: string;
  credentials: Credential[];
  folders: CredentialFolder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewCredential: (folderId: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [movingFolder, setMovingFolder] = useState<CredentialFolder | null>(
    null,
  );
  const renameInputRef = useRef<HTMLInputElement>(null);

  const createFolder = useCreateCredentialFolder();
  const updateFolder = useUpdateCredentialFolder();
  const deleteFolder = useDeleteCredentialFolder();

  useEffect(() => {
    if (renamingFolderId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingFolderId]);

  const { byParent: foldersByParent, byId: foldersById } = useMemo(
    () => buildFolderMaps(folders),
    [folders],
  );
  const credentialsByFolder = useMemo(
    () => buildCredentialsByFolder(credentials),
    [credentials],
  );

  const query = search.trim().toLowerCase();
  const searching = query.length > 0;
  const matchedFolders = searching
    ? folders.filter((f) => f.name.toLowerCase().includes(query))
    : [];
  const matchedCredentials = searching
    ? credentials.filter(
        (c) =>
          c.title.toLowerCase().includes(query) ||
          c.url?.toLowerCase().includes(query),
      )
    : [];

  function toggle(folderId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  // Expands a folder and every one of its ancestors — used to reveal a search result in the tree.
  function revealFolder(folderId: string) {
    setSearch("");
    setExpanded((prev) => {
      const next = new Set(prev);
      let cursor: CredentialFolder | undefined = foldersById.get(folderId);
      while (cursor) {
        next.add(cursor.id);
        cursor = cursor.parentFolderId
          ? foldersById.get(cursor.parentFolderId)
          : undefined;
      }
      return next;
    });
  }

  function handleNewFolder(parentFolderId: string | null) {
    createFolder.mutate(
      { workspaceId, parentFolderId, name: "New folder" },
      {
        onSuccess: (folder) => {
          if (parentFolderId) {
            setExpanded((prev) => new Set(prev).add(parentFolderId));
          }
          setRenamingFolderId(folder.id);
          setRenameValue(folder.name);
        },
      },
    );
  }

  function handleNewCredential(folderId: string | null) {
    if (folderId) setExpanded((prev) => new Set(prev).add(folderId));
    onNewCredential(folderId);
  }

  function startRename(folder: CredentialFolder) {
    setRenamingFolderId(folder.id);
    setRenameValue(folder.name);
  }

  function commitRename() {
    if (renamingFolderId) {
      updateFolder.mutate({
        id: renamingFolderId,
        name: renameValue.trim() || "Untitled",
      });
    }
    setRenamingFolderId(null);
  }

  function handleDeleteFolder(folder: CredentialFolder) {
    if (
      !window.confirm(
        `Delete "${folder.name || "this folder"}"? Credentials inside will move to the root level; empty subfolders will be deleted.`,
      )
    ) {
      return;
    }
    deleteFolder.mutate({ id: folder.id, workspaceId });
  }

  const rootFolders = foldersByParent.get(null) ?? [];
  const rootCredentials = credentialsByFolder.get(null) ?? [];
  const isEmpty = folders.length === 0 && credentials.length === 0;

  return (
    <div className="flex w-full shrink-0 flex-col border-r border-paper-200 md:w-72">
      <div className="flex items-center justify-between gap-2 border-b border-paper-200 p-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="min-w-0 flex-1 rounded-md border border-paper-200 bg-paper-50 px-2 py-1.5 text-sm text-ink-800 outline-none focus:border-accent-500"
        />
        <button
          type="button"
          onClick={() => handleNewFolder(null)}
          disabled={createFolder.isPending}
          aria-label="New folder"
          title="New folder"
          className="shrink-0 rounded-md p-1.5 text-ink-500 hover:bg-paper-100 hover:text-ink-800 disabled:opacity-60"
        >
          <FolderPlusIcon />
        </button>
        <button
          type="button"
          onClick={() => handleNewCredential(null)}
          aria-label="New credential"
          title="New credential"
          className="shrink-0 rounded-md px-2 py-1.5 text-sm text-ink-500 hover:bg-paper-100 hover:text-ink-800"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {searching ? (
          matchedFolders.length === 0 && matchedCredentials.length === 0 ? (
            <p className="p-3 text-sm text-ink-400">No matches.</p>
          ) : (
            <ul>
              {matchedFolders.map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    onClick={() => revealFolder(folder.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-800 hover:bg-paper-50"
                  >
                    <span className="truncate">
                      {folder.name || "Untitled"}
                    </span>
                  </button>
                </li>
              ))}
              {matchedCredentials.map((credential) => (
                <CredentialLeafRow
                  key={credential.id}
                  credential={credential}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  depth={0}
                />
              ))}
            </ul>
          )
        ) : isEmpty ? (
          <p className="px-3 py-1.5 text-sm text-ink-400">
            No credentials yet.
          </p>
        ) : (
          <ul>
            {rootFolders.map((folder) => (
              <CredentialFolderTreeNode
                key={folder.id}
                folder={folder}
                foldersByParent={foldersByParent}
                credentialsByFolder={credentialsByFolder}
                expanded={expanded}
                onToggle={toggle}
                onCreateSubfolder={handleNewFolder}
                onCreateCredential={handleNewCredential}
                selectedId={selectedId}
                onSelectCredential={onSelect}
                renamingFolderId={renamingFolderId}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onCommitRename={commitRename}
                onCancelRename={() => setRenamingFolderId(null)}
                renameInputRef={renameInputRef}
                onStartRename={startRename}
                onMove={setMovingFolder}
                onDelete={handleDeleteFolder}
                depth={0}
              />
            ))}
            {rootCredentials.map((credential) => (
              <CredentialLeafRow
                key={credential.id}
                credential={credential}
                selectedId={selectedId}
                onSelect={onSelect}
                depth={0}
              />
            ))}
          </ul>
        )}
      </div>

      {movingFolder && (
        <MoveCredentialFolderModal
          folder={movingFolder}
          folders={folders}
          open={true}
          onClose={() => setMovingFolder(null)}
        />
      )}
    </div>
  );
}
