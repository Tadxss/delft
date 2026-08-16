import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Plain RLS-gated delete (credential_folders_delete_member). Unlike useDeletePage, this is NOT a
// uniform cascade: credential_folders.parent_folder_id is `on delete cascade` (empty sub-folder
// shells go with it), but credentials.folder_id is `on delete set null` (credentials inside always
// survive, reparented to root) — see supabase/migrations/20260816090000_credential_folders.sql.
// Callers should still confirm with the user first, since sub-folders themselves are unrecoverable.
//
// Invalidates BOTH query keys: surviving sub-folders' removal and surviving credentials'
// now-changed folder_id are both invisible to the client cache otherwise.
export function useDeleteCredentialFolder() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; workspaceId: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase
        .from("credential_folders")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { workspaceId }) => {
      queryClient.invalidateQueries({
        queryKey: ["credentialFolders", workspaceId],
      });
      queryClient.invalidateQueries({ queryKey: ["credentials", workspaceId] });
    },
  });
}
