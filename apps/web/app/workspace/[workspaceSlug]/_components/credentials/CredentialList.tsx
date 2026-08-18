"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Folder, FolderPlus, Plus, Search } from "lucide-react";
import type { Credential, CredentialFolder } from "@delft/types";
import {
  useCreateCredentialFolder,
  useDeleteCredentialFolder,
  useUpdateCredentialFolder,
  computeSubtreeIds,
} from "@delft/shared";
import {
  CredentialFolderTreeNode,
  CredentialLeafRow,
} from "./CredentialFolderTreeNode";

// Slim strip at the top of the tree, only visually shown while a drag is active — dropping a
// folder here moves it to the root level. No natural section-header label to repurpose the way
// Sidebar.tsx's "Pages" header is (this tree's top bar is search + icon buttons, not safe to
// swallow as a droppable), so this exists as its own dedicated, always-non-overlapping target
// instead. Always mounted at a CONSTANT height (never conditionally rendered, and never resized
// between active/inactive) — only opacity toggles. Two real bugs ruled out this way, not just a
// style preference:
//   1. A droppable that only mounts once a drag has already started needs dnd-kit to
//      register/measure it mid-drag, which was unreliable in WebKit/mobile Safari (the drop would
//      silently fail to register even though the strip was visibly showing as a valid target).
//   2. Toggling its HEIGHT (not just opacity) between active/inactive pushes every row below it
//      down the instant ANY drag starts (not just one headed toward root) — which shifts the
//      bounding box of whatever row you're actually dragging toward mid-drag, since real pointer
//      coordinates are computed before that shift happens. A real user, not just a test, would
//      have felt this as the drop target moving out from under their cursor.
function RootDropStrip({ active }: { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "credentials-root" });
  return (
    <div
      ref={setNodeRef}
      className={`mx-1 mb-1 flex h-7 shrink-0 items-center justify-center rounded-md border border-dashed text-xs ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      } ${isOver ? "border-accent-500 bg-paper-200 text-ink-800" : "border-paper-300 text-ink-400"}`}
    >
      Move to root
    </div>
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [excludedDropIds, setExcludedDropIds] = useState<Set<string>>(
    new Set(),
  );
  const [dragError, setDragError] = useState<string | null>(null);
  // Two sensors, not one PointerSensor for both — see Sidebar.tsx's matching setup for why: a
  // delay-based constraint (needed on touch, so a scroll swipe isn't hijacked as a drag) makes
  // mouse dragging feel broken, since it requires holding the pointer still for the full delay
  // before any movement is allowed. Mouse gets an immediate small-distance threshold instead.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Track the latest renamingFolderId/renameValue via refs so commitRename can read fresh values
  // without needing them in its own dependency array — renameValue changes on every keystroke,
  // and commitRename is passed unconditionally to every tree node, so a deps-driven identity
  // change there would reopen the exact re-render fan-out this file's memoization otherwise fixes.
  const renamingFolderIdRef = useRef(renamingFolderId);
  renamingFolderIdRef.current = renamingFolderId;
  const renameValueRef = useRef(renameValue);
  renameValueRef.current = renameValue;

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

  const toggle = useCallback((folderId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

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

  const handleNewFolder = useCallback(
    (parentFolderId: string | null) => {
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
    },
    // createFolder.mutate is stable across renders (TanStack Query guarantee); the wrapping
    // createFolder object isn't, so depending on it would give this callback a new identity every
    // render and defeat the memoization CredentialFolderTreeNode relies on to skip re-rendering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspaceId, createFolder.mutate],
  );

  const handleNewCredential = useCallback(
    (folderId: string | null) => {
      if (folderId) setExpanded((prev) => new Set(prev).add(folderId));
      onNewCredential(folderId);
    },
    [onNewCredential],
  );

  const startRename = useCallback((folder: CredentialFolder) => {
    setRenamingFolderId(folder.id);
    setRenameValue(folder.name);
  }, []);

  const commitRename = useCallback(() => {
    const id = renamingFolderIdRef.current;
    if (id) {
      updateFolder.mutate({
        id,
        name: renameValueRef.current.trim() || "Untitled",
      });
    }
    setRenamingFolderId(null);
    // updateFolder.mutate is stable across renders (TanStack Query guarantee); the wrapping
    // updateFolder object isn't, so depending on it would give this callback a new identity every
    // render and defeat the memoization CredentialFolderTreeNode relies on to skip re-rendering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateFolder.mutate]);

  const cancelRename = useCallback(() => setRenamingFolderId(null), []);

  const handleDeleteFolder = useCallback(
    (folder: CredentialFolder) => {
      if (
        !window.confirm(
          `Delete "${folder.name || "this folder"}"? Credentials inside will move to the root level; empty subfolders will be deleted.`,
        )
      ) {
        return;
      }
      deleteFolder.mutate({ id: folder.id, workspaceId });
    },
    // deleteFolder.mutate is stable across renders (TanStack Query guarantee); the wrapping
    // deleteFolder object isn't, so depending on it would give this callback a new identity every
    // render and defeat the memoization CredentialFolderTreeNode relies on to skip re-rendering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspaceId, deleteFolder.mutate],
  );

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setDraggingId(id);
    setExcludedDropIds(computeSubtreeIds(id, folders, (f) => f.parentFolderId));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingId(null);
    setExcludedDropIds(new Set());
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (overId === activeId) return;

    const draggedFolder = folders.find((f) => f.id === activeId);
    if (!draggedFolder) return;

    const targetParentId = overId === "credentials-root" ? null : overId;
    if (targetParentId !== null) {
      const excluded = computeSubtreeIds(
        activeId,
        folders,
        (f) => f.parentFolderId,
      );
      if (excluded.has(targetParentId)) return;
    }
    if (draggedFolder.parentFolderId === targetParentId) return;

    updateFolder.mutate(
      { id: activeId, parentFolderId: targetParentId },
      {
        onError: (e) => setDragError(e.message),
        onSuccess: () => setDragError(null),
      },
    );
  }

  const draggingFolder = draggingId
    ? folders.find((f) => f.id === draggingId)
    : null;

  const rootFolders = foldersByParent.get(null) ?? [];
  const rootCredentials = credentialsByFolder.get(null) ?? [];
  const isEmpty = folders.length === 0 && credentials.length === 0;

  return (
    <div className="flex w-full shrink-0 flex-col border-r border-paper-200 md:w-72">
      <div className="flex items-center justify-between gap-2 border-b border-paper-200 p-3">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="w-full rounded-md border border-paper-200 bg-paper-50 py-1.5 pl-8 pr-2 text-sm text-ink-800 outline-none focus:border-accent-500"
          />
        </div>
        <button
          type="button"
          onClick={() => handleNewFolder(null)}
          disabled={createFolder.isPending}
          aria-label="New folder"
          title="New folder"
          className="shrink-0 rounded-md p-1.5 text-ink-500 hover:bg-paper-100 hover:text-ink-800 disabled:opacity-60"
        >
          <FolderPlus size={16} />
        </button>
        <button
          type="button"
          onClick={() => handleNewCredential(null)}
          aria-label="New credential"
          title="New credential"
          className="shrink-0 rounded-md p-1.5 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
        >
          <Plus size={16} />
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-y-auto py-1">
          {dragError && (
            <p className="px-3 pb-1 text-xs text-red-700">
              Couldn&apos;t move folder: {dragError}
            </p>
          )}
          {!searching && <RootDropStrip active={draggingId !== null} />}
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
                      <Folder size={14} className="shrink-0 text-ink-400" />
                      <span className="truncate font-medium">
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
                  excludedDropIds={excludedDropIds}
                  onToggle={toggle}
                  onCreateSubfolder={handleNewFolder}
                  onCreateCredential={handleNewCredential}
                  selectedId={selectedId}
                  onSelectCredential={onSelect}
                  renamingFolderId={renamingFolderId}
                  renameValue={renameValue}
                  onRenameChange={setRenameValue}
                  onCommitRename={commitRename}
                  onCancelRename={cancelRename}
                  renameInputRef={renameInputRef}
                  onStartRename={startRename}
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
          <DragOverlay>
            {draggingFolder && (
              <div className="flex items-center gap-1.5 rounded-md border border-paper-200 bg-paper-50 px-2 py-1 text-sm text-ink-800 shadow-lg">
                <Folder size={14} className="shrink-0 text-ink-400" />
                {draggingFolder.name || "Untitled"}
              </div>
            )}
          </DragOverlay>
        </div>
      </DndContext>
    </div>
  );
}
