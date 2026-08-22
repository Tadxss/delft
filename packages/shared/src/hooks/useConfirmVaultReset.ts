import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Confirms a last-resort vault reset via the reset_vault RPC (see
// supabase/migrations/20260822160105_reset_vault_rpc.sql) — genuinely destructive, deletes every
// credential/folder in the workspace and clears all vault columns. Called only from
// vault-reset/confirm/page.tsx after an explicit final button click, never automatically on page
// load (see that page's own comments on why).
export function useConfirmVaultReset() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { workspaceId: string; token: string }>({
    mutationFn: async ({ workspaceId, token }) => {
      const { error } = await supabase.rpc("reset_vault", {
        p_workspace_id: workspaceId,
        p_token: token,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ["credentials", workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ["credentialFolders", workspaceId],
      });
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
  });
}
