import { useQuery } from "@tanstack/react-query";
import type { CredentialFolder } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCredentialFolderRow } from "../supabase/mappers";

// Direct RLS-gated read — credential_folders_select_member already limits this to the caller's own
// workspace. Fetches the whole set in one query, like usePages: the UI builds the parent_folder_id
// tree client-side rather than one query per folder drilled into.
export function useCredentialFolders(workspaceId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<CredentialFolder[]>({
    queryKey: ["credentialFolders", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credential_folders")
        .select("*")
        .eq("workspace_id", workspaceId as string)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapCredentialFolderRow);
    },
  });
}
