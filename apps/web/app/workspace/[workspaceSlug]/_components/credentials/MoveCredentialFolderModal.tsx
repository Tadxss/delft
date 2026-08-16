"use client";

import { useMemo, useState } from "react";
import type { CredentialFolder } from "@delft/types";
import { useUpdateCredentialFolder } from "@delft/shared";
import { Modal } from "../../../../_components/Modal";

// The real guard against cycles is the credential_folders_check_parent trigger (server-side) —
// this exclusion is just so the picker itself never *offers* an invalid target in the first place.
function computeExcludedIds(
  folderId: string,
  folders: CredentialFolder[],
): Set<string> {
  const excluded = new Set<string>([folderId]);
  let added = true;
  while (added) {
    added = false;
    for (const f of folders) {
      if (
        f.parentFolderId &&
        excluded.has(f.parentFolderId) &&
        !excluded.has(f.id)
      ) {
        excluded.add(f.id);
        added = true;
      }
    }
  }
  return excluded;
}

function flattenOptions(
  folders: CredentialFolder[],
  excludedIds: Set<string>,
): { id: string; label: string }[] {
  const byParent = new Map<string | null, CredentialFolder[]>();
  for (const f of folders) {
    const key = f.parentFolderId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(f);
  }

  const flattened: { id: string; label: string }[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const f of byParent.get(parentId) ?? []) {
      if (excludedIds.has(f.id)) continue;
      flattened.push({
        id: f.id,
        label: `${"  ".repeat(depth)}${f.name || "Untitled"}`,
      });
      walk(f.id, depth + 1);
    }
  }
  walk(null, 0);
  return flattened;
}

export function MoveCredentialFolderModal({
  folder,
  folders,
  open,
  onClose,
}: {
  folder: CredentialFolder;
  folders: CredentialFolder[];
  open: boolean;
  onClose: () => void;
}) {
  const updateFolder = useUpdateCredentialFolder();
  const [targetId, setTargetId] = useState<string>(folder.parentFolderId ?? "");

  const excludedIds = useMemo(
    () => computeExcludedIds(folder.id, folders),
    [folder.id, folders],
  );
  const options = useMemo(
    () => flattenOptions(folders, excludedIds),
    [folders, excludedIds],
  );

  function handleMove() {
    updateFolder.mutate(
      { id: folder.id, parentFolderId: targetId || null },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-sm">
      <div className="p-4">
        <h2 className="text-sm font-medium text-ink-800">
          Move &quot;{folder.name || "Untitled"}&quot;
        </h2>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="mt-3 w-full rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        >
          <option value="">Root</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleMove}
            disabled={updateFolder.isPending}
            className="rounded-md bg-ink-800 px-3 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
          >
            {updateFolder.isPending ? "Moving…" : "Move"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-paper-200 px-3 py-2 text-sm text-ink-600 hover:bg-paper-50"
          >
            Cancel
          </button>
        </div>
        {updateFolder.error && (
          <p className="mt-2 text-xs text-red-700">
            {updateFolder.error.message}
          </p>
        )}
      </div>
    </Modal>
  );
}
