import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CredentialFolder, Database } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCredentialFolderRow } from "../supabase/mappers";

type CredentialFoldersUpdate =
  Database["public"]["Tables"]["credential_folders"]["Update"];

export interface UpdateCredentialFolderInput {
  id: string;
  name?: string;
  parentFolderId?: string | null;
  position?: number;
}

// Rename and move are the same operation here, same as useUpdatePage folding title/content/parentId
// into one hook — `parentFolderId: null` (move to root) must stay distinguishable from "not
// provided," hence `!== undefined` rather than a truthy check. `updated_at` is maintained
// server-side by credential_folders_set_updated_at. The credential_folders_check_parent trigger is
// the real enforcement for cycles/cross-workspace moves — this hook just surfaces whatever error it
// raises.
export function useUpdateCredentialFolder() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<CredentialFolder, Error, UpdateCredentialFolderInput>({
    mutationFn: async ({ id, name, parentFolderId, position }) => {
      const patch: CredentialFoldersUpdate = {};
      if (name !== undefined) patch.name = name;
      if (parentFolderId !== undefined) patch.parent_folder_id = parentFolderId;
      if (position !== undefined) patch.position = position;

      const { data, error } = await supabase
        .from("credential_folders")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapCredentialFolderRow(data);
    },
    onSuccess: (folder) => {
      queryClient.setQueryData<CredentialFolder>(
        ["credentialFolder", folder.id],
        folder,
      );
      queryClient.invalidateQueries({
        queryKey: ["credentialFolders", folder.workspaceId],
      });
    },
  });
}
