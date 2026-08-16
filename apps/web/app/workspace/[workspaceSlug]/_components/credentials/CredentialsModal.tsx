"use client";

import { useEffect, useState } from "react";
import { useCredentials, useVaultKey, useWorkspace } from "@delft/shared";
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
  const { data: credentials } = useCredentials(open ? workspaceId : undefined);
  const [selectedId, setSelectedId] = useState<string | null | "new">(null);

  // Reset per-open state (selection) and guarantee the key is gone whenever the modal isn't
  // visible, not just when the user explicitly clicks a lock button.
  useEffect(() => {
    if (!open) {
      vaultKey.lock();
      setSelectedId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on open/close, not on every vaultKey identity change
  }, [open]);

  function handleClose() {
    vaultKey.lock();
    setSelectedId(null);
    onClose();
  }

  const selectedCredential =
    selectedId && selectedId !== "new"
      ? ((credentials ?? []).find((c) => c.id === selectedId) ?? null)
      : null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      widthClassName="max-w-3xl"
      heightClassName="h-[600px]"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-paper-200 px-4 py-2">
        <span className="text-sm font-medium text-ink-800">Credentials</span>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="rounded px-2 py-1 text-sm text-ink-500 hover:bg-paper-100 hover:text-ink-800"
        >
          ×
        </button>
      </div>

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
            workspaceId={workspaceId}
            vaultSalt={workspace.vaultSalt}
            vaultVerifier={workspace.vaultVerifier}
            vaultVerifierIv={workspace.vaultVerifierIv}
            credentials={credentials}
          />
        ) : (
          <>
            <CredentialList
              credentials={credentials ?? []}
              selectedId={selectedId === "new" ? null : selectedId}
              onSelect={setSelectedId}
              onNew={() => setSelectedId("new")}
            />
            <div className="flex-1 overflow-y-auto">
              {selectedId === "new" ? (
                <CredentialDetail
                  workspaceId={workspaceId}
                  credential={null}
                  vaultKey={vaultKey.key}
                  onSaved={setSelectedId}
                  onDeleted={() => setSelectedId(null)}
                />
              ) : selectedCredential ? (
                <CredentialDetail
                  workspaceId={workspaceId}
                  credential={selectedCredential}
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
