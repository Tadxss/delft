import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Declines an invitation via its token (decline_workspace_invitation RPC). Idempotent server-side.
export function useDeclineWorkspaceInvitation(userId: string | undefined) {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { token: string }>({
    mutationFn: async ({ token }) => {
      const { error } = await supabase.rpc("decline_workspace_invitation", {
        p_token: token,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["my-pending-invitations", userId],
      });
    },
  });
}
