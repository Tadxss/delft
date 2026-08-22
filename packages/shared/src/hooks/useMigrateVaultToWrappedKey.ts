import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// One-time migration of a legacy vault (has vault_salt, no vault_wrapped_key) to the wrapped-key
// model — calls the migrate_vault_to_wrapped_key RPC (see
// supabase/migrations/20260822154438_migrate_vault_to_wrapped_key_rpc.sql) which re-encrypts every
// credential's secret under a new client-generated VMK and persists the wrapped-key columns in one
// atomic transaction. The re-encryption itself (decrypt with the old direct key, encrypt with the
// VMK) happens client-side in VaultMigrationPanel.tsx before this is called — this hook only ever
// sends ciphertext. RLS-gated by workspaces_update_owner (via the RPC's own ownership check, since
// it's invoker-rights, not security definer) — a non-owner member's call fails cleanly, see the
// RPC's own comments for why.
export function useMigrateVaultToWrappedKey() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      workspaceId: string;
      wrappedKey: string;
      wrappedKeyIv: string;
      recoveryWrappedKey: string;
      recoveryWrappedKeyIv: string;
      credentialIds: string[];
      credentials: { id: string; secretCiphertext: string; secretIv: string }[];
    }
  >({
    mutationFn: async ({
      workspaceId,
      wrappedKey,
      wrappedKeyIv,
      recoveryWrappedKey,
      recoveryWrappedKeyIv,
      credentialIds,
      credentials,
    }) => {
      const { error } = await supabase.rpc("migrate_vault_to_wrapped_key", {
        p_workspace_id: workspaceId,
        p_wrapped_key: wrappedKey,
        p_wrapped_key_iv: wrappedKeyIv,
        p_recovery_wrapped_key: recoveryWrappedKey,
        p_recovery_wrapped_key_iv: recoveryWrappedKeyIv,
        p_credential_ids: credentialIds,
        p_credentials: credentials.map((c) => ({
          id: c.id,
          secret_ciphertext: c.secretCiphertext,
          secret_iv: c.secretIv,
        })),
      });
      if (error) throw error;
    },
    onSuccess: (_data, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ["credentials", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
  });
}
