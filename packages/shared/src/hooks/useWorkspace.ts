import { useQuery } from "@tanstack/react-query";
import type { Workspace } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceRow } from "../supabase/mappers";

export function useWorkspace(workspaceId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<Workspace | null>({
    queryKey: ["workspace", workspaceId],
    enabled: Boolean(workspaceId),
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
