import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Plain RLS-gated delete (canvases_delete_member).
export function useDeleteCanvas() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; workspaceId: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from("canvases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ["canvases", workspaceId] });
    },
  });
}
