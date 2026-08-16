import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Workspace } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceRow } from "../supabase/mappers";

// Backfills workspaces.vault_verifier/_iv for a vault that predates that column — called
// opportunistically after a legacy vault is unlocked correctly (verified by test-decrypting an
// existing credential instead), so every unlock from then on can use the faster, always-available
// verifier check instead. Best-effort by design: RLS-gated by workspaces_update_owner like
// useSetVaultSalt, so a non-owner member who correctly unlocks a shared vault can't write this —
// that's fine, it just means the backfill happens next time the owner unlocks instead.
export function useSetVaultVerifier() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<
    Workspace,
    Error,
    { workspaceId: string; verifierCiphertext: string; verifierIv: string }
  >({
    mutationFn: async ({ workspaceId, verifierCiphertext, verifierIv }) => {
      const { data, error } = await supabase
        .from("workspaces")
        .update({
          vault_verifier: verifierCiphertext,
          vault_verifier_iv: verifierIv,
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
