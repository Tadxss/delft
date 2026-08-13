import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Workspace } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceRow } from "../supabase/mappers";

// Called exactly once per workspace, the first time its vault passphrase is set up (see
// vaultCrypto.ts's generateSalt()). RLS-gated by workspaces_update_owner — only the workspace
// owner can set this, same as any other workspace-level update.
export function useSetVaultSalt() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Workspace, Error, { workspaceId: string; saltB64: string }>({
    mutationFn: async ({ workspaceId, saltB64 }) => {
      const { data, error } = await supabase
        .from("workspaces")
        .update({ vault_salt: saltB64 })
        .eq("id", workspaceId)
        .select()
        .single();
      if (error) throw error;
      return mapWorkspaceRow(data);
    },
    onSuccess: (workspace) => {
      queryClient.setQueryData<Workspace>(["workspace", workspace.id], workspace);
    },
  });
}
