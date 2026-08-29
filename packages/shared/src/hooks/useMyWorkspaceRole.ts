import { useQuery } from "@tanstack/react-query";
import type { WorkspaceRole } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { STALE_TIME_SUMMARY_LIST } from "../queryConfig";

// The signed-in user's own role in a workspace, or null if they're not a member. A plain self-read
// of `workspace_members` — permitted by `workspace_members_select_self` (user_id = auth.uid()), no
// RPC needed. Drives the client-side read-only affordances for `viewer` (RLS is the real gate).
export function useMyWorkspaceRole(workspaceId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<WorkspaceRole | null>({
    queryKey: ["my-workspace-role", workspaceId],
    enabled: Boolean(workspaceId),
    staleTime: STALE_TIME_SUMMARY_LIST,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId as string)
        .maybeSingle();
      if (error) throw error;
      return (data?.role ?? null) as WorkspaceRole | null;
    },
  });
}
