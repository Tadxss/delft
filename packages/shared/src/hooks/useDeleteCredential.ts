import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Plain RLS-gated delete (credentials_delete_member).
export function useDeleteCredential() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; workspaceId: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase
        .from("credentials")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ["credentials", workspaceId] });
    },
  });
}
