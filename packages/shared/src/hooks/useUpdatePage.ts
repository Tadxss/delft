import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Database, Json, Page } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapPageRow } from "../supabase/mappers";

type PagesUpdate = Database["public"]["Tables"]["pages"]["Update"];

export interface UpdatePageInput {
  id: string;
  title?: string;
  content?: unknown;
  parentId?: string | null;
}

// Backs both the title field and the BlockNote autosave (apps/web debounces calls to this hook by
// ~800ms before invoking it — no debounce logic lives here, callers decide their own cadence).
// `updated_at` is maintained server-side by the pages_set_updated_at trigger, not passed in.
export function useUpdatePage() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Page, Error, UpdatePageInput>({
    mutationFn: async ({ id, title, content, parentId }) => {
      const patch: PagesUpdate = {};
      if (title !== undefined) patch.title = title;
      if (content !== undefined) patch.content = content as Json;
      if (parentId !== undefined) patch.parent_id = parentId;

      const { data, error } = await supabase
        .from("pages")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapPageRow(data);
    },
    onSuccess: (page) => {
      queryClient.setQueryData<Page>(["page", page.id], page);
      queryClient.invalidateQueries({ queryKey: ["pages", page.workspaceId] });
    },
  });
}
