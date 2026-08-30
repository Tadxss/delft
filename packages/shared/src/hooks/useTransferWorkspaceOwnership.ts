import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Owner hands the workspace to another member (transfer_workspace_ownership RPC). The caller
// becomes an editor; the target becomes owner. Refused if the workspace has a credentials vault
// (the vault key can't be transferred). Irreversible from the caller's side — confirm first.
export function useTransferWorkspaceOwnership(workspaceId: string) {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { newOwnerId: string }>({
    mutationFn: async ({ newOwnerId }) => {
      const { error } = await supabase.rpc("transfer_workspace_ownership", {
        p_workspace_id: workspaceId,
        p_new_owner_id: newOwnerId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // owner_id + the caller's role both changed — refresh the list, the single-workspace query
      // that drives the owner-only sidebar affordances, membership, and the viewer/editor gate.
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ["workspace-members", workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["my-workspace-role", workspaceId],
      });
    },
  });
}
