import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceVault } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceVaultRow } from "../supabase/mappers";

// Sets a new passphrase after a successful recovery-key-based unlock (see
// ForgotPassphrasePanel.tsx) — writes a new salt and the VMK re-wrapped under the new
// passphrase-derived key. Deliberately does NOT touch vault_recovery_wrapped_key/_iv: the
// recovery key and the passphrase are independent factors that both unwrap the same VMK, so
// resetting one must never invalidate the other. RLS (workspace_vaults_update_self) scopes the
// update to the caller's own row.
export function useRotateVaultPassphrase() {
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
    }
  >({
    mutationFn: async ({ workspaceId, saltB64, wrappedKey, wrappedKeyIv }) => {
      const { data, error } = await supabase
        .from("workspace_vaults")
        .update({
          vault_salt: saltB64,
          vault_wrapped_key: wrappedKey,
          vault_wrapped_key_iv: wrappedKeyIv,
        })
        .eq("workspace_id", workspaceId)
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
