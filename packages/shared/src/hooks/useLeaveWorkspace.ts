import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// A non-owner member removes themselves from a workspace (leave_workspace RPC). The owner can't
// leave their own workspace (they delete it instead).
export function useLeaveWorkspace(userId: string | undefined) {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { workspaceId: string }>({
    mutationFn: async ({ workspaceId }) => {
      const { error } = await supabase.rpc("leave_workspace", {
        p_workspace_id: workspaceId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", userId] });
      queryClient.invalidateQueries({
        queryKey: ["my-workspace-role", workspaceId],
      });
    },
  });
}
