import { useQuery } from "@tanstack/react-query";
import type { InvitationPreview } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapInvitationPreview } from "../supabase/mappers";

// Non-sensitive display fields for the /invite/[token] accept screen — the visitor isn't a member
// yet, so RLS can't surface the workspace row. get_invitation_preview is a token-guarded,
// rate-limited SECURITY DEFINER RPC callable by anon+authenticated. Returns null when the token
// matches nothing (or the rate limit is hit).
export function useInvitationPreview(token: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<InvitationPreview | null>({
    queryKey: ["invitation-preview", token],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_invitation_preview", {
        p_token: token as string,
      });
      if (error) throw error;
      const row = data?.[0];
      return row ? mapInvitationPreview(row) : null;
    },
  });
}
