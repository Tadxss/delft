import { useQuery } from "@tanstack/react-query";
import type { Workspace } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceRow } from "../supabase/mappers";
import { GC_TIME_SUMMARY_LIST, STALE_TIME_SUMMARY_LIST } from "../queryConfig";

export function useWorkspace(workspaceId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<Workspace | null>({
    queryKey: ["workspace", workspaceId],
    enabled: Boolean(workspaceId),
    // Only ever changes via explicit mutations that already setQueryData/invalidateQueries on this
    // exact key (vault setup/rotation/reset, workspace rename) — see queryConfig.ts.
    staleTime: STALE_TIME_SUMMARY_LIST,
    gcTime: GC_TIME_SUMMARY_LIST,
    queryFn: async () => {
      // maybeSingle(), not single(): a stale/mistyped workspace id in the URL is an expected
      // outcome the UI shows an empty/not-found state for, not a server error worth a 406 + retry.
      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .eq("id", workspaceId as string)
        .maybeSingle();
      if (error) throw error;
      return data ? mapWorkspaceRow(data) : null;
    },
  });
}
