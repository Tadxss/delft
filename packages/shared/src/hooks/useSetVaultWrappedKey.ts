import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Workspace } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceRow } from "../supabase/mappers";

// Called exactly once per workspace, the first time its vault is set up under the wrapped-key
// model (see vaultCrypto.ts's generateVaultMasterKey/wrapVaultMasterKey) — persists the salt and
// both wrapped copies of the Vault Master Key (under the passphrase-derived key, and under the
// one-time-shown recovery key) in a single write, so there's never a moment where vault_salt is
// set without the wrapped-key columns alongside it. Replaces useSetVaultSalt for first-time setup;
// useSetVaultSalt itself stays only for the legacy verifier-backfill path in VaultUnlockPanel.
// RLS-gated by workspaces_update_owner, same as every other workspace-level vault write.
export function useSetVaultWrappedKey() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<
    Workspace,
    Error,
    {
      workspaceId: string;
      saltB64: string;
      wrappedKey: string;
      wrappedKeyIv: string;
      recoveryWrappedKey: string;
      recoveryWrappedKeyIv: string;
    }
  >({
    mutationFn: async ({
      workspaceId,
      saltB64,
      wrappedKey,
      wrappedKeyIv,
      recoveryWrappedKey,
      recoveryWrappedKeyIv,
    }) => {
      const { data, error } = await supabase
        .from("workspaces")
        .update({
          vault_salt: saltB64,
          vault_wrapped_key: wrappedKey,
          vault_wrapped_key_iv: wrappedKeyIv,
          vault_recovery_wrapped_key: recoveryWrappedKey,
          vault_recovery_wrapped_key_iv: recoveryWrappedKeyIv,
        })
        .eq("id", workspaceId)
        .select()
        .single();
      if (error) throw error;
      return mapWorkspaceRow(data);
    },
    onSuccess: (workspace) => {
      queryClient.setQueryData<Workspace>(
        ["workspace", workspace.id],
        workspace,
      );
    },
  });
}
