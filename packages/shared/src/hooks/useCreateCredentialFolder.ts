import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CredentialFolder } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCredentialFolderRow } from "../supabase/mappers";

export interface CreateCredentialFolderInput {
  workspaceId: string;
  parentFolderId?: string | null;
  name?: string;
}

// Plain RLS-gated insert (credential_folders_insert_member). The
// credential_folders_check_parent trigger validates parentFolderId (same workspace, not a cycle)
// server-side — this hook doesn't duplicate that check client-side beyond what the UI needs for a
// good error message.
export function useCreateCredentialFolder() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<CredentialFolder, Error, CreateCredentialFolderInput>({
    mutationFn: async ({ workspaceId, parentFolderId = null, name = "" }) => {
      const { data, error } = await supabase
        .from("credential_folders")
        .insert({
          workspace_id: workspaceId,
          parent_folder_id: parentFolderId,
          name,
        })
        .select()
        .single();
      if (error) throw error;
      return mapCredentialFolderRow(data);
    },
    onSuccess: (folder) => {
      // Merge synchronously, same reasoning as useCreateCredential's onSuccess — avoids a window
      // where the new folder's id is referenced (e.g. for immediate inline rename) before a
      // background refetch has caught up.
      queryClient.setQueryData<CredentialFolder[]>(
        ["credentialFolders", folder.workspaceId],
        (old) => (old ? [...old, folder] : [folder]),
      );
      queryClient.invalidateQueries({
        queryKey: ["credentialFolders", folder.workspaceId],
      });
    },
  });
}
