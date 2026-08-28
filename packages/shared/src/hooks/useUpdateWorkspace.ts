import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Database, Workspace } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceRow } from "../supabase/mappers";

type WorkspacesUpdate = Database["public"]["Tables"]["workspaces"]["Update"];

export interface UpdateWorkspaceInput {
  id: string;
  name?: string;
  logoUrl?: string | null;
}

// Partial patch of a workspace row — rename and/or set/clear the logo. Same shape as
// useUpsertProfile: only keys explicitly passed are written. RLS-gated by workspaces_update_owner
// (owner only). Writes the server response into ["workspace", id] and invalidates the
// ["workspaces", …] list so the picker reflects a rename/logo change (the vault UPDATE hooks only
// touch the single-workspace key; this one also affects the list).
export function useUpdateWorkspace() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Workspace, Error, UpdateWorkspaceInput>({
    mutationFn: async ({ id, name, logoUrl }) => {
      const patch: WorkspacesUpdate = {};
      if (name !== undefined) patch.name = name;
      if (logoUrl !== undefined) patch.logo_url = logoUrl;

      const { data, error } = await supabase
        .from("workspaces")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapWorkspaceRow(data);
    },
    onSuccess: (workspace) => {
      queryClient.setQueryData<Workspace>(
        ["workspace", workspace.id],
        workspace,
      );
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}
