import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Plain RLS-gated delete (workspaces_delete_owner) — `on delete cascade` on every workspace_id
// foreign key (workspace_members, pages, credentials, canvases) means this cascades everything
// else for free. Callers should confirm with the user first; this is unrecoverable.
export function useDeleteWorkspace(userId: string | undefined) {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from("workspaces").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", userId] });
    },
  });
}
