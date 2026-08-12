import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Plain RLS-gated delete (pages_delete_member). `on delete cascade` on pages.parent_id (see
// supabase/migrations init) means deleting a page also deletes its whole descendant subtree —
// callers should confirm with the user before calling this on a page with children.
export function useDeletePage() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; workspaceId: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from("pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ["pages", workspaceId] });
    },
  });
}
