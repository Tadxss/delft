import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InvitableRole, WorkspaceInvitation } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceInvitationRow } from "../supabase/mappers";

// Creates a workspace invitation via the invite_to_workspace RPC (owner-only). Pass exactly one of
// `email` / `username`. Returns the full invitation row incl. `token` so the caller can show a
// copy-link. (The magic-link email for brand-new invitees is a later pass — see the plan.)
export function useInviteToWorkspace(workspaceId: string) {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<
    WorkspaceInvitation,
    Error,
    { email?: string; username?: string; role: InvitableRole }
  >({
    mutationFn: async ({ email, username, role }) => {
      const { data, error } = await supabase.rpc("invite_to_workspace", {
        p_workspace_id: workspaceId,
        p_email: email ?? "",
        p_username: username ?? "",
        p_role: role,
      });
      if (error) throw error;
      return mapWorkspaceInvitationRow(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["workspace-invitations", workspaceId],
      });
    },
  });
}
