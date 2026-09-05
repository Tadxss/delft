import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";
import {
  duplicatePageImages,
  type DuplicatedPageRow,
} from "../lib/duplicatePageImages";

export interface DuplicatePageInput {
  id: string;
  workspaceId: string;
  // Where the duplicate should land among the source page's siblings — callers compute this with
  // computeReorderPosition(source.position, nextSibling?.position ?? null) so it lands right after
  // the original, same as a drag-to-reorder drop.
  newPosition: number;
}

// Calls the duplicate_page RPC (supabase/migrations) to atomically copy a page and its whole
// descendant subtree, then best-effort copies each duplicated page's Storage images and rewrites
// their content to point at the copies (see duplicatePageImages.ts) — the RPC itself can't touch
// Storage from SQL. Returns the new root page's id so the caller could navigate to it, though the
// current UI stays put and just lets the new sibling appear in the sidebar.
export function useDuplicatePage() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<string, Error, DuplicatePageInput>({
    mutationFn: async ({ id, newPosition }) => {
      const { data, error } = await supabase.rpc("duplicate_page", {
        p_source_id: id,
        p_new_position: newPosition,
      });
      if (error) throw error;

      const rows = (data ?? []) as DuplicatedPageRow[];
      await duplicatePageImages(supabase, rows);

      const root = rows.find((row) => row.is_root);
      if (!root) throw new Error("duplicate_page did not return the new root page");
      return root.new_id;
    },
    onSuccess: (_newRootId, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ["pages", workspaceId] });
    },
  });
}
