import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Database, Json, Page } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapPageRow } from "../supabase/mappers";
import { StaleWriteError } from "../lib/staleWriteError";

type PagesUpdate = Database["public"]["Tables"]["pages"]["Update"];

export interface UpdatePageInput {
  id: string;
  title?: string;
  content?: unknown;
  parentId?: string | null;
  position?: number;
  // Autosave passes the `updated_at` it last saw; if the row moved on since (another tab / editor),
  // the `.eq` matches nothing and this throws StaleWriteError. Structural callers (reorder,
  // reparent, publish toggle) omit it and keep plain last-write-wins.
  expectedUpdatedAt?: string;
}

// Backs both the title field and the BlockNote autosave (apps/web debounces calls to this hook by
// ~800ms before invoking it — no debounce logic lives here, callers decide their own cadence).
// `updated_at` is maintained server-side by the pages_set_updated_at trigger, not passed in.
export function useUpdatePage() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Page, Error, UpdatePageInput>({
    mutationFn: async ({
      id,
      title,
      content,
      parentId,
      position,
      expectedUpdatedAt,
    }) => {
      const patch: PagesUpdate = {};
      if (title !== undefined) patch.title = title;
      if (content !== undefined) patch.content = content as Json;
      if (parentId !== undefined) patch.parent_id = parentId;
      if (position !== undefined) patch.position = position;

      let query = supabase.from("pages").update(patch).eq("id", id);
      if (expectedUpdatedAt !== undefined) {
        query = query.eq("updated_at", expectedUpdatedAt);
      }
      const { data, error } = await query.select().single();
      if (error) {
        if (expectedUpdatedAt !== undefined && error.code === "PGRST116") {
          throw new StaleWriteError();
        }
        throw error;
      }
      return mapPageRow(data);
    },
    onSuccess: (page, variables) => {
      queryClient.setQueryData<Page>(["page", page.id], page);
      // The sidebar tree (usePages) only renders title/parentId/position — skip invalidating it
      // on a content-only autosave, which can't have changed anything it shows. Editing runs this
      // mutation on every debounced keystroke, so this avoids a full workspace-wide pages refetch
      // that frequently.
      const { title, parentId, position } = variables;
      if (title !== undefined || parentId !== undefined || position !== undefined) {
        queryClient.invalidateQueries({
          queryKey: ["pages", page.workspaceId],
        });
      }
    },
  });
}
