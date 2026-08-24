import { useQuery } from "@tanstack/react-query";
import type { Workspace } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceRow } from "../supabase/mappers";
import { GC_TIME_SUMMARY_LIST, STALE_TIME_SUMMARY_LIST } from "../queryConfig";

// Direct RLS-gated read — workspaces_select_member (supabase/migrations) already limits this to
// workspaces the signed-in user belongs to, so no extra client-side filter is needed.
export function useWorkspaces(userId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<Workspace[]>({
    queryKey: ["workspaces", userId],
    enabled: Boolean(userId),
    // Only changes via explicit create/delete mutations that already invalidate this key — see
    // queryConfig.ts.
    staleTime: STALE_TIME_SUMMARY_LIST,
    gcTime: GC_TIME_SUMMARY_LIST,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapWorkspaceRow);
    },
  });
}
