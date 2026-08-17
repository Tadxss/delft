import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";
import { removePageImages } from "../lib/removePageImages";

// Plain RLS-gated delete (workspaces_delete_owner) — `on delete cascade` on every workspace_id
// foreign key (workspace_members, pages, credentials, canvases) means this cascades everything
// else for free. Callers should confirm with the user first; this is unrecoverable.
export function useDeleteWorkspace(userId: string | undefined) {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      // Same ordering requirement as useDeletePage: Storage cleanup must happen while the caller
      // is still a workspace member, i.e. before the row delete cascades workspace_members away.
      const { data: pages, error: fetchError } = await supabase
        .from("pages")
        .select("id")
        .eq("workspace_id", id);
      if (fetchError) throw fetchError;
      await removePageImages(supabase, id, (pages ?? []).map((page) => page.id));

      const { error } = await supabase.from("workspaces").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", userId] });
    },
  });
}
