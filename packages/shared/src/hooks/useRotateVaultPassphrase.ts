import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Workspace } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceRow } from "../supabase/mappers";

// Sets a new passphrase after a successful recovery-key-based unlock (see
// ForgotPassphrasePanel.tsx) — writes a new salt and the VMK re-wrapped under the new
// passphrase-derived key. Deliberately does NOT touch vault_recovery_wrapped_key/_iv: the
// recovery key and the passphrase are independent factors that both unwrap the same VMK, so
// resetting one must never invalidate the other. RLS-gated by workspaces_update_owner.
export function useRotateVaultPassphrase() {
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
    }
  >({
    mutationFn: async ({ workspaceId, saltB64, wrappedKey, wrappedKeyIv }) => {
      const { data, error } = await supabase
        .from("workspaces")
        .update({
          vault_salt: saltB64,
          vault_wrapped_key: wrappedKey,
          vault_wrapped_key_iv: wrappedKeyIv,
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
