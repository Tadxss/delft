import { useQuery } from "@tanstack/react-query";
import type { PendingInvitation } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapPendingInvitation } from "../supabase/mappers";

// Pending workspace invitations addressed to the signed-in user (by email, username, or resolved
// user id) — shown on the workspace picker. Backed by get_my_pending_invitations (a SECURITY
// DEFINER RPC, since matching an invite to "me" needs the jwt email + a profiles lookup).
export function useMyPendingInvitations(userId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<PendingInvitation[]>({
    queryKey: ["my-pending-invitations", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_pending_invitations");
      if (error) throw error;
      return (data ?? []).map(mapPendingInvitation);
    },
  });
}
