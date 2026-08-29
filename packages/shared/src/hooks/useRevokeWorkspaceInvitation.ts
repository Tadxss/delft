import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Owner revokes a still-pending invitation (revoke_workspace_invitation RPC).
export function useRevokeWorkspaceInvitation(workspaceId: string) {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { invitationId: string }>({
    mutationFn: async ({ invitationId }) => {
      const { error } = await supabase.rpc("revoke_workspace_invitation", {
        p_invitation_id: invitationId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["workspace-invitations", workspaceId],
      });
    },
  });
}
