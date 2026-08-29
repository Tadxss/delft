import { useQuery } from "@tanstack/react-query";
import type { WorkspaceMemberProfile } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceMemberProfile } from "../supabase/mappers";

// The full member roster for a workspace, for the manage-members UI. `workspace_members` has a
// self-only SELECT policy, so the roster comes from get_workspace_members (SECURITY DEFINER,
// caller must be a member; member emails are only included when the caller is the owner).
export function useWorkspaceMembers(workspaceId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<WorkspaceMemberProfile[]>({
    queryKey: ["workspace-members", workspaceId],
    enabled: Boolean(workspaceId),
    // The roster changes out-of-band (another member accepts an invite, an owner in another tab) —
    // always refetch when the modal that reads this mounts.
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_workspace_members", {
        p_workspace_id: workspaceId as string,
      });
      if (error) throw error;
      return (data ?? []).map(mapWorkspaceMemberProfile);
    },
  });
}
