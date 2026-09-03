import { useQuery } from "@tanstack/react-query";
import type { WorkspaceVault } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceVaultRow } from "../supabase/mappers";
import { GC_TIME_SUMMARY_LIST, STALE_TIME_SUMMARY_LIST } from "../queryConfig";

// The calling member's own vault row for this workspace, or null if they haven't set one up
// (Build Order step 92 — per-member vaults). `workspace_vaults` RLS is self-only, so the
// `.eq("workspace_id", …)` is the only filter needed — a member never sees another member's row.
// This is what tells the Credentials modal "setup vs unlock". Only ever changes via the vault
// setup / rotate / reset mutations, which all setQueryData/invalidate this exact key.
export function useMyWorkspaceVault(workspaceId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<WorkspaceVault | null>({
    queryKey: ["workspace-vault", workspaceId],
    enabled: Boolean(workspaceId),
    staleTime: STALE_TIME_SUMMARY_LIST,
    gcTime: GC_TIME_SUMMARY_LIST,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_vaults")
        .select("*")
        .eq("workspace_id", workspaceId as string)
        .maybeSingle();
      if (error) throw error;
      return data ? mapWorkspaceVaultRow(data) : null;
    },
  });
}
