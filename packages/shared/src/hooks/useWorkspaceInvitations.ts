import { useQuery } from "@tanstack/react-query";
import type { WorkspaceInvitationSummary } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceInvitationSummary } from "../supabase/mappers";

// Pending invitations for a workspace, for the owner's manage-members UI. Owner-only
// (get_workspace_invitations raises 42501 otherwise). Includes each invite's token so the UI can
// build a copy-link.
export function useWorkspaceInvitations(workspaceId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<WorkspaceInvitationSummary[]>({
    queryKey: ["workspace-invitations", workspaceId],
    enabled: Boolean(workspaceId),
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_workspace_invitations", {
        p_workspace_id: workspaceId as string,
      });
      if (error) throw error;
      return (data ?? []).map(mapWorkspaceInvitationSummary);
    },
  });
}
