import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InvitableRole, WorkspaceInvitation } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceInvitationRow } from "../supabase/mappers";

// Creates a workspace invitation via the invite_to_workspace RPC (owner-only). Pass exactly one of
// `email` / `username`. Returns the full invitation row incl. `token` so the caller can show a
// copy-link.
//
// For an *email* invite, this also fires the `send-invitation-email` Edge Function (fire-and-
// forget — the RPC insert is the source of truth, and the function no-ops when RESEND_API_KEY is
// unset). `@username` invites send no email: that person has an account and sees the invite
// in-app via get_my_pending_invitations.
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
    onSuccess: (invitation, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["workspace-invitations", workspaceId],
      });
      if (variables.email) {
        void supabase.functions
          .invoke("send-invitation-email", {
            body: { token: invitation.token },
          })
          .catch(() => {});
      }
    },
  });
}
