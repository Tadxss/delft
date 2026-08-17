import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";
import { removePageImages } from "../lib/removePageImages";

// Plain RLS-gated delete (pages_delete_member). `on delete cascade` on pages.parent_id (see
// supabase/migrations init) means deleting a page also deletes its whole descendant subtree —
// callers should confirm with the user before calling this on a page with children.
export function useDeletePage() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; workspaceId: string }>({
    mutationFn: async ({ id, workspaceId }) => {
      // Clean up the whole subtree's Storage images *before* the row delete, not after — must
      // happen while the caller is still a workspace member, and the cascade below is about to
      // wipe every one of these page ids at once, not just `id` itself.
      const { data: pages, error: fetchError } = await supabase
        .from("pages")
        .select("id, parent_id")
        .eq("workspace_id", workspaceId);
      if (fetchError) throw fetchError;

      const childrenOf = new Map<string, string[]>();
      for (const page of pages ?? []) {
        const key = page.parent_id ?? "";
        childrenOf.set(key, [...(childrenOf.get(key) ?? []), page.id]);
      }
      const subtreeIds: string[] = [];
      const queue = [id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        subtreeIds.push(current);
        queue.push(...(childrenOf.get(current) ?? []));
      }
      await removePageImages(supabase, workspaceId, subtreeIds);

      const { error } = await supabase.from("pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ["pages", workspaceId] });
    },
  });
}
