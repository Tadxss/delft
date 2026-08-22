"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  useCredentialFolders,
  useCredentials,
  useVaultKey,
  useWorkspace,
} from "@delft/shared";
import { Modal } from "../../../../_components/Modal";
import { VaultUnlockPanel } from "./VaultUnlockPanel";
import { CredentialList } from "./CredentialList";
import { CredentialDetail } from "./CredentialDetail";

// Always re-prompts for the vault passphrase on every open — closing the modal (backdrop click,
// Escape, the × button) locks the vault via handleClose below, discarding the in-memory key, so
// there's no "unlock once per browser session" carry-over the way most other apps' vaults work.
// A deliberate choice: the passphrase-entry friction is accepted in exchange for never leaving a
// derived key sitting in memory once the vault isn't actively open.
export function CredentialsModal({
  workspaceId,
  open,
  onClose,
}: {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: workspace } = useWorkspace(workspaceId);
  const vaultKey = useVaultKey(workspaceId);
  // Fetched as soon as the modal opens, independent of vault-lock state: RLS already scopes these
  // rows to workspace members, and secretCiphertext/secretIv stay encrypted regardless — this just
  // makes a credential available for VaultUnlockPanel to test-decrypt the passphrase against
  // *before* granting access, rather than only after.
  const {
    data: credentials,
    isError: credentialsError,
    error: credentialsErrorObj,
  } = useCredentials(open ? workspaceId : undefined);
  const { data: folders } = useCredentialFolders(
    open ? workspaceId : undefined,
  );
  const [selectedId, setSelectedId] = useState<string | null | "new">(null);
  // Which folder a brand-new credential should default into — set from wherever "New credential"
  // was clicked (the root toolbar, or a specific folder's own hover action in the tree).
  const [newCredentialFolderId, setNewCredentialFolderId] = useState<
    string | null
  >(null);
  // Set by VaultUnlockPanel while an unsaved, one-time-shown recovery key exists in memory (first
  // setup, or a legacy vault's migration) — closing the modal in that window would silently lose
  // the user's only chance to save it, so both the backdrop/Escape close and the × button are
  // disabled until it clears.
  const [vaultBusy, setVaultBusy] = useState(false);

  // Reset per-open state (selection) and guarantee the key is gone whenever the modal isn't
  // visible, not just when the user explicitly clicks a lock button.
  useEffect(() => {
    if (!open) {
      vaultKey.lock();
      setSelectedId(null);
      setNewCredentialFolderId(null);
      setVaultBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on open/close, not on every vaultKey identity change
  }, [open]);

  // If the credential currently open was deleted out from under this session (another tab, another
  // device), bounce back to the empty state rather than getting stuck on a dead reference.
  useEffect(() => {
    if (!credentials) return;
    if (
      selectedId &&
      selectedId !== "new" &&
      !credentials.some((c) => c.id === selectedId)
    ) {
      setSelectedId(null);
    }
  }, [credentials, selectedId]);

  function handleClose() {
    if (vaultBusy) return;
    vaultKey.lock();
    setSelectedId(null);
    setNewCredentialFolderId(null);
    onClose();
  }

  const handleNewCredential = useCallback((folderId: string | null) => {
    setNewCredentialFolderId(folderId);
    setSelectedId("new");
  }, []);

  const selectedCredential =
    selectedId && selectedId !== "new"
      ? ((credentials ?? []).find((c) => c.id === selectedId) ?? null)
      : null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      widthClassName="max-w-3xl"
      heightClassName="h-[720px]"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-paper-200 px-4 py-2">
        <span className="text-sm font-medium text-ink-800">Credentials</span>
        <button
          type="button"
          onClick={handleClose}
          disabled={vaultBusy}
          aria-label="Close"
          className="rounded px-2 py-1 text-sm text-ink-500 hover:bg-paper-100 hover:text-ink-800 disabled:pointer-events-none disabled:opacity-40"
        >
          <X size={16} />
        </button>
      </div>

      {credentialsError && (
        <p className="shrink-0 border-b border-paper-200 px-4 py-2 text-xs text-red-700">
          Couldn&apos;t load credentials: {credentialsErrorObj.message}
        </p>
      )}

      {/* A fixed modal height (above) means every state below must actually fill it — flex's
          default align-items:stretch does that for whichever single child renders here, as long
          as that child doesn't set its own conflicting height. */}
      <div className="flex min-h-0 flex-1">
        {!workspace ? (
          <p className="flex flex-1 items-center justify-center text-sm text-ink-400">
            Loading…
          </p>
        ) : !vaultKey.isUnlocked || !vaultKey.key ? (
          <VaultUnlockPanel
            workspace={workspace}
            credentials={credentials}
            onBusyChange={setVaultBusy}
          />
        ) : (
          // Below `md`, only one pane is shown at a time (list, or detail with a "Back" row) —
          // CredentialList's own root is `w-full md:w-72`, so at full width it would otherwise
          // collide with the detail pane rather than genuinely replacing it.
          <>
            <div
              className={
                selectedId ? "hidden md:flex" : "flex flex-1 md:flex-none"
              }
            >
              <CredentialList
                workspaceId={workspaceId}
                credentials={credentials ?? []}
                folders={folders ?? []}
                selectedId={selectedId === "new" ? null : selectedId}
                onSelect={setSelectedId}
                onNewCredential={handleNewCredential}
              />
            </div>
            <div
              className={`min-h-0 flex-1 flex-col overflow-y-auto ${
                selectedId ? "flex" : "hidden md:flex"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="flex shrink-0 items-center gap-1 border-b border-paper-200 px-4 py-2 text-sm text-ink-500 hover:text-ink-800 md:hidden"
              >
                ← Back
              </button>
              {selectedId === "new" ? (
                <CredentialDetail
                  workspaceId={workspaceId}
                  credential={null}
                  newCredentialFolderId={newCredentialFolderId}
                  folders={folders ?? []}
                  vaultKey={vaultKey.key}
                  onSaved={setSelectedId}
                  onDeleted={() => setSelectedId(null)}
                />
              ) : selectedCredential ? (
                <CredentialDetail
                  workspaceId={workspaceId}
                  credential={selectedCredential}
                  newCredentialFolderId={newCredentialFolderId}
                  folders={folders ?? []}
                  vaultKey={vaultKey.key}
                  onSaved={setSelectedId}
                  onDeleted={() => setSelectedId(null)}
                />
              ) : (
                <p className="flex h-full items-center justify-center text-sm text-ink-400">
                  Select a credential, or create a new one.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
