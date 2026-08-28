import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Database, Workspace } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceRow } from "../supabase/mappers";
import { removeWorkspaceLogo } from "../lib/removeWorkspaceLogo";

type WorkspacesUpdate = Database["public"]["Tables"]["workspaces"]["Update"];

export interface UpdateWorkspaceInput {
  id: string;
  name?: string;
  logoUrl?: string | null;
  description?: string | null;
}

// Partial patch of a workspace row — rename, set/clear the logo, edit the description. Same shape
// as useUpsertProfile: only keys explicitly passed are written. RLS-gated by
// workspaces_update_owner (owner only). Writes the server response into ["workspace", id] and
// invalidates the ["workspaces", …] list so the picker reflects the change (the vault UPDATE
// hooks only touch the single-workspace key; this one also affects the list).
//
// When `logoUrl` changes to anything that isn't this workspace's own uploaded object (null, or an
// external URL), the now-unreferenced `{id}/logo.webp` in the workspace-logos bucket is deleted so
// the bucket only ever holds the current logo.
export function useUpdateWorkspace() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Workspace, Error, UpdateWorkspaceInput>({
    mutationFn: async ({ id, name, logoUrl, description }) => {
      const patch: WorkspacesUpdate = {};
      if (name !== undefined) patch.name = name;
      if (logoUrl !== undefined) patch.logo_url = logoUrl;
      if (description !== undefined) patch.description = description;

      const { data, error } = await supabase
        .from("workspaces")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      if (logoUrl !== undefined) {
        const keepsUploadedObject =
          typeof logoUrl === "string" &&
          logoUrl.includes(`/workspace-logos/${id}/logo.webp`);
        if (!keepsUploadedObject) await removeWorkspaceLogo(supabase, id);
      }

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
