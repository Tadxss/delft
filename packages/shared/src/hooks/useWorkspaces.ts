import { useQuery } from "@tanstack/react-query";
import type { Workspace } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceRow } from "../supabase/mappers";

// Direct RLS-gated read — workspaces_select_member (supabase/migrations) already limits this to
// workspaces the signed-in user belongs to, so no extra client-side filter is needed.
export function useWorkspaces(userId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<Workspace[]>({
    queryKey: ["workspaces", userId],
    enabled: Boolean(userId),
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
