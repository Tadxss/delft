import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InvitableRole } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";

// Owner changes a member's role between editor / viewer (set_workspace_member_role RPC). The owner
// row can't be targeted.
export function useSetWorkspaceMemberRole(workspaceId: string) {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { userId: string; role: InvitableRole }>({
    mutationFn: async ({ userId, role }) => {
      const { error } = await supabase.rpc("set_workspace_member_role", {
        p_workspace_id: workspaceId,
        p_user_id: userId,
        p_role: role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["workspace-members", workspaceId],
      });
    },
  });
}
