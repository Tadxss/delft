"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { Credential, CredentialFolder, CredentialType } from "@crowscribe/types";
import {
  useCreateCredentialFolder,
  useDeleteCredentialFolder,
  useUpdateCredential,
  useUpdateCredentialFolder,
  computeSubtreeIds,
  computeAppendPosition,
  computeReorderPosition,
} from "@crowscribe/shared";
import {
  CredentialFolderTreeNode,
  CredentialLeafRow,
} from "./CredentialFolderTreeNode";
import { CREDENTIAL_TYPE_OPTIONS, credentialTypeOption } from "./credentialTypeOptions";
import { ReorderStrip } from "../ReorderStrip";
import { dragOverlayDropAnimation, offsetDragOverlay } from "../dragOverlayOffset";

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
      className={`mx-1 mb-1 flex h-7 shrink-0 items-center justify-center rounded-md border border-dashed text-xs transition-all ${
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
  const [typeFilter, setTypeFilter] = useState<Set<CredentialType>>(
    new Set(),
  );
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
  const updateCredential = useUpdateCredential();
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
  // A type filter reuses the same flattened "matched" list mode as a text search, rather than a
  // second parallel UI — filtering the tree while preserving folder nesting for hidden items would
  // add real complexity for a feature the search box's flat-list approach already handles well.
  const filtering = searching || typeFilter.size > 0;
  const matchedFolders = searching
    ? folders.filter((f) => f.name.toLowerCase().includes(query))
    : [];
  const matchedCredentials = filtering
    ? credentials.filter(
        (c) =>
          (!searching ||
            c.title.toLowerCase().includes(query) ||
            c.url?.toLowerCase().includes(query)) &&
          (typeFilter.size === 0 || typeFilter.has(c.type)),
      )
    : [];

  const toggleTypeFilter = useCallback((type: CredentialType) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

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

  // Draggable ids in this tree are prefixed by kind ("folder:xxx" / "credential:xxx") — unlike
  // Sidebar.tsx's pages tree, this one drags two different kinds of item through the same
  // DndContext, so handleDragEnd needs to know which kind was picked up before it can decide what a
  // given drop target even means (a folder onto a folder reparents/reorders folders; a credential
  // onto a folder reparents it; a credential onto a credential-reorder-strip repositions it).
  function handleDragStart(event: DragStartEvent) {
    const rawId = String(event.active.id);
    setDraggingId(rawId);
    if (rawId.startsWith("folder:")) {
      const id = rawId.slice("folder:".length);
      setExcludedDropIds(computeSubtreeIds(id, folders, (f) => f.parentFolderId));
    } else {
      // Dragging a credential — it has no descendants, so nothing is excluded as a target.
      setExcludedDropIds(new Set());
    }
  }

  function handleFolderDragEnd(folderId: string, overId: string) {
    if (overId === folderId) return;

    const draggedFolder = folders.find((f) => f.id === folderId);
    if (!draggedFolder) return;

    // The credential group's own leading strip ("...:start") doubles as "append this folder as the
    // new last folder in that parent" whenever that parent has both folders and credentials — see
    // this file's root rendering and CredentialFolderTreeNode.tsx for why the folder group's own
    // trailing strip is deliberately not rendered in that case (it would physically overlap this
    // one, both sitting at a zero-height boundary with no row between them).
    if (overId.startsWith("credential-leaf-strip:") && overId.endsWith(":start")) {
      const rest = overId.slice("credential-leaf-strip:".length);
      const parentKey = rest.slice(0, rest.indexOf(":"));
      const targetParentId = parentKey === "root" ? null : parentKey;
      if (targetParentId !== null) {
        const excluded = computeSubtreeIds(folderId, folders, (f) => f.parentFolderId);
        if (excluded.has(targetParentId)) return;
      }
      updateFolder.mutate(
        {
          id: folderId,
          parentFolderId: targetParentId,
          position: computeAppendPosition(
            (foldersByParent.get(targetParentId) ?? []).filter((f) => f.id !== folderId),
          ),
        },
        {
          onError: (e) => setDragError(e.message),
          onSuccess: () => setDragError(null),
        },
      );
      return;
    }

    // Dropped on a reorder strip between two folders (or before the first / after the last) —
    // reorder within, or reparent into, whichever parent that strip belongs to.
    if (overId.startsWith("credential-folder-strip:")) {
      const rest = overId.slice("credential-folder-strip:".length);
      const sep = rest.indexOf(":");
      const parentKey = rest.slice(0, sep);
      const afterId = rest.slice(sep + 1);
      const targetParentId = parentKey === "root" ? null : parentKey;
      if (afterId === folderId) return;

      if (targetParentId !== null) {
        const excluded = computeSubtreeIds(folderId, folders, (f) => f.parentFolderId);
        if (excluded.has(targetParentId)) return;
      }

      const siblings = (foldersByParent.get(targetParentId) ?? []).filter(
        (f) => f.id !== folderId,
      );
      const anchorIndex =
        afterId === "start" ? -1 : siblings.findIndex((f) => f.id === afterId);
      const before = anchorIndex >= 0 ? siblings[anchorIndex]!.position : null;
      const after = siblings[anchorIndex + 1]?.position ?? null;

      updateFolder.mutate(
        {
          id: folderId,
          parentFolderId: targetParentId,
          position: computeReorderPosition(before, after),
        },
        {
          onError: (e) => setDragError(e.message),
          onSuccess: () => setDragError(null),
        },
      );
      return;
    }

    // Dropped directly on the root strip or another folder's row — reparent, appended at the end.
    if (!overId.startsWith("folder:") && overId !== "credentials-root") return;
    const targetParentId =
      overId === "credentials-root" ? null : overId.slice("folder:".length);
    if (targetParentId !== null) {
      const excluded = computeSubtreeIds(folderId, folders, (f) => f.parentFolderId);
      if (excluded.has(targetParentId)) return;
    }
    if (draggedFolder.parentFolderId === targetParentId) return;

    updateFolder.mutate(
      {
        id: folderId,
        parentFolderId: targetParentId,
        position: computeAppendPosition(foldersByParent.get(targetParentId) ?? []),
      },
      {
        onError: (e) => setDragError(e.message),
        onSuccess: () => setDragError(null),
      },
    );
  }

  function handleCredentialDragEnd(credentialId: string, overId: string) {
    if (overId === credentialId) return;
    const draggedCredential = credentials.find((c) => c.id === credentialId);
    if (!draggedCredential) return;

    // Dropped on a reorder strip between two credentials in some specific folder's own list.
    if (overId.startsWith("credential-leaf-strip:")) {
      const rest = overId.slice("credential-leaf-strip:".length);
      const sep = rest.indexOf(":");
      const parentKey = rest.slice(0, sep);
      const afterId = rest.slice(sep + 1);
      const targetFolderId = parentKey === "root" ? null : parentKey;
      if (afterId === credentialId) return;

      const siblings = (credentialsByFolder.get(targetFolderId) ?? []).filter(
        (c) => c.id !== credentialId,
      );
      const anchorIndex =
        afterId === "start" ? -1 : siblings.findIndex((c) => c.id === afterId);
      const before = anchorIndex >= 0 ? siblings[anchorIndex]!.position : null;
      const after = siblings[anchorIndex + 1]?.position ?? null;

      updateCredential.mutate(
        {
          id: credentialId,
          folderId: targetFolderId,
          position: computeReorderPosition(before, after),
        },
        {
          onError: (e) => setDragError(e.message),
          onSuccess: () => setDragError(null),
        },
      );
      return;
    }

    // Dropped directly on the root strip or a folder's row — reparent, appended at the end.
    if (!overId.startsWith("folder:") && overId !== "credentials-root") return;
    const targetFolderId =
      overId === "credentials-root" ? null : overId.slice("folder:".length);
    if (draggedCredential.folderId === targetFolderId) return;

    updateCredential.mutate(
      {
        id: credentialId,
        folderId: targetFolderId,
        position: computeAppendPosition(credentialsByFolder.get(targetFolderId) ?? []),
      },
      {
        onError: (e) => setDragError(e.message),
        onSuccess: () => setDragError(null),
      },
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const rawActiveId = String(active.id);
    setDraggingId(null);
    setExcludedDropIds(new Set());
    if (!over) return;
    const overId = String(over.id);

    if (rawActiveId.startsWith("folder:")) {
      handleFolderDragEnd(rawActiveId.slice("folder:".length), overId);
    } else if (rawActiveId.startsWith("credential:")) {
      handleCredentialDragEnd(rawActiveId.slice("credential:".length), overId);
    }
  }

  const draggingFolder =
    draggingId && draggingId.startsWith("folder:")
      ? folders.find((f) => f.id === draggingId.slice("folder:".length))
      : null;
  const draggingCredential =
    draggingId && draggingId.startsWith("credential:")
      ? credentials.find((c) => c.id === draggingId.slice("credential:".length))
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

      <div className="flex flex-wrap gap-1 border-b border-paper-200 p-2">
        {CREDENTIAL_TYPE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = typeFilter.has(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleTypeFilter(option.value)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
                active
                  ? "border-accent-500 bg-accent-500 text-white"
                  : "border-paper-200 text-ink-500 hover:bg-paper-100"
              }`}
            >
              <Icon size={12} />
              {option.label}
            </button>
          );
        })}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        modifiers={[offsetDragOverlay]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-y-auto py-1">
          {dragError && (
            <p className="px-3 pb-1 text-xs text-red-700">
              Couldn&apos;t move: {dragError}
            </p>
          )}
          {!filtering && <RootDropStrip active={draggingId !== null} />}
          {filtering ? (
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
              Your vault is empty. Keep your treasures safe.
            </p>
          ) : (
            <ul>
              {rootFolders.map((folder, index) => (
                <Fragment key={folder.id}>
                  <ReorderStrip
                    id={`credential-folder-strip:root:${index === 0 ? "start" : rootFolders[index - 1]!.id}`}
                    active={draggingId !== null}
                  />
                  <CredentialFolderTreeNode
                    folder={folder}
                    foldersByParent={foldersByParent}
                    credentialsByFolder={credentialsByFolder}
                    expanded={expanded}
                    excludedDropIds={excludedDropIds}
                    dragActive={draggingId !== null}
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
                </Fragment>
              ))}
              {/* Only rendered when there's no credential group right after it — see the matching
                  comment in CredentialFolderTreeNode.tsx for why. */}
              {rootFolders.length > 0 && rootCredentials.length === 0 && (
                <ReorderStrip
                  id={`credential-folder-strip:root:${rootFolders[rootFolders.length - 1]!.id}`}
                  active={draggingId !== null}
                />
              )}
              {rootCredentials.map((credential, index) => (
                <Fragment key={credential.id}>
                  <ReorderStrip
                    id={`credential-leaf-strip:root:${index === 0 ? "start" : rootCredentials[index - 1]!.id}`}
                    active={draggingId !== null}
                  />
                  <CredentialLeafRow
                    credential={credential}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    depth={0}
                  />
                </Fragment>
              ))}
              {rootCredentials.length > 0 && (
                <ReorderStrip
                  id={`credential-leaf-strip:root:${rootCredentials[rootCredentials.length - 1]!.id}`}
                  active={draggingId !== null}
                />
              )}
            </ul>
          )}
          <DragOverlay dropAnimation={dragOverlayDropAnimation}>
            {draggingFolder && (
              <div className="scale-105 flex items-center gap-1.5 rounded-md border border-paper-200 bg-paper-50 px-2 py-1 text-sm text-ink-800 shadow-xl">
                <Folder size={14} className="shrink-0 text-ink-400" />
                {draggingFolder.name || "Untitled"}
              </div>
            )}
            {draggingCredential &&
              (() => {
                const DraggingTypeIcon = credentialTypeOption(
                  draggingCredential.type,
                ).icon;
                return (
                  <div className="scale-105 flex items-center gap-1.5 rounded-md border border-paper-200 bg-paper-50 px-2 py-1 text-sm text-ink-800 shadow-xl">
                    <DraggingTypeIcon
                      size={14}
                      className="shrink-0 text-ink-400"
                    />
                    {draggingCredential.title || "Untitled"}
                  </div>
                );
              })()}
          </DragOverlay>
        </div>
      </DndContext>
    </div>
  );
}
