import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Accepts an invitation via its token — the accept_workspace_invitation RPC is the only new writer
// of `workspace_members`. Returns the joined workspace's id. Invalidates the picker + pending-invite
// lists so the new workspace appears immediately.
export function useAcceptWorkspaceInvitation(userId: string | undefined) {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<string, Error, { token: string }>({
    mutationFn: async ({ token }) => {
      const { data, error } = await supabase.rpc("accept_workspace_invitation", {
        p_token: token,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", userId] });
      queryClient.invalidateQueries({
        queryKey: ["my-pending-invitations", userId],
      });
      queryClient.invalidateQueries({
        queryKey: ["my-workspace-role", workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["workspace-members", workspaceId],
      });
    },
  });
}
