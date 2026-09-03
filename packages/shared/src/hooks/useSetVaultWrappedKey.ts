import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceVault } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceVaultRow } from "../supabase/mappers";

// Called exactly once per member per workspace, the first time they set up their vault (see
// vaultCrypto.ts's generateVaultMasterKey/wrapVaultMasterKey) — inserts the salt and both
// wrapped copies of the Vault Master Key (under the passphrase-derived key, and under the
// one-time-shown recovery key) as a single row, so there's never a partial vault. `user_id`
// fills from the `default auth.uid()` on the column; RLS (workspace_vaults_insert_self) checks
// it matches and that the caller is a member.
export function useSetVaultWrappedKey() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<
    WorkspaceVault,
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
        .from("workspace_vaults")
        .insert({
          workspace_id: workspaceId,
          vault_salt: saltB64,
          vault_wrapped_key: wrappedKey,
          vault_wrapped_key_iv: wrappedKeyIv,
          vault_recovery_wrapped_key: recoveryWrappedKey,
          vault_recovery_wrapped_key_iv: recoveryWrappedKeyIv,
        })
        .select()
        .single();
      if (error) throw error;
      return mapWorkspaceVaultRow(data);
    },
    onSuccess: (vault) => {
      queryClient.setQueryData<WorkspaceVault>(
        ["workspace-vault", vault.workspaceId],
        vault,
      );
    },
  });
}
