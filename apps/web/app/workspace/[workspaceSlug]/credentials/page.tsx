"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { parseWorkspaceSlug, useCredentials, useVaultKey, useWorkspace } from "@delft/shared";
import { VaultUnlockPanel } from "./_components/VaultUnlockPanel";
import { CredentialList } from "./_components/CredentialList";
import { CredentialDetail } from "./_components/CredentialDetail";

export default function CredentialsPage() {
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceId = parseWorkspaceSlug(params.workspaceSlug);
  const { data: workspace, isLoading: workspaceLoading } = useWorkspace(workspaceId);
  const vaultKey = useVaultKey(workspaceId);
  const { data: credentials } = useCredentials(vaultKey.isUnlocked ? workspaceId : undefined);
  const [selectedId, setSelectedId] = useState<string | null | "new">(null);

  if (workspaceLoading || !workspace) {
    return <p className="p-6 text-sm text-ink-400">Loading…</p>;
  }

  if (!vaultKey.isUnlocked || !vaultKey.key) {
    return <VaultUnlockPanel workspaceId={workspaceId} vaultSalt={workspace.vaultSalt} />;
  }

  const selectedCredential =
    selectedId && selectedId !== "new" ? (credentials ?? []).find((c) => c.id === selectedId) ?? null : null;

  return (
    <div className="flex h-full flex-1">
      <CredentialList
        credentials={credentials ?? []}
        selectedId={selectedId === "new" ? null : selectedId}
        onSelect={setSelectedId}
        onNew={() => setSelectedId("new")}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="flex justify-end p-3">
          <button
            type="button"
            onClick={() => {
              vaultKey.lock();
              setSelectedId(null);
            }}
            className="rounded px-2 py-1 text-xs text-ink-500 hover:bg-paper-100"
          >
            Lock vault
          </button>
        </div>
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
          <p className="p-6 text-sm text-ink-400">Select a credential, or create a new one.</p>
        )}
      </div>
    </div>
  );
}
