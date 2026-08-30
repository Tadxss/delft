import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Canvas, Database, Json } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCanvasRow } from "../supabase/mappers";
import { StaleWriteError } from "../lib/staleWriteError";

type CanvasesUpdate = Database["public"]["Tables"]["canvases"]["Update"];

export interface UpdateCanvasInput {
  id: string;
  title?: string;
  scene?: unknown;
  position?: number;
  // See useUpdatePage — autosave passes the last-seen `updated_at`; a mismatch throws
  // StaleWriteError. Reorder omits it.
  expectedUpdatedAt?: string;
}

// Backs both the title field and the canvas autosave (apps/web debounces calls to this hook,
// same ~800ms pattern as useUpdatePage — no debounce logic lives here). `updated_at` is
// maintained server-side by canvases_set_updated_at, not passed in.
export function useUpdateCanvas() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Canvas, Error, UpdateCanvasInput>({
    mutationFn: async ({ id, title, scene, position, expectedUpdatedAt }) => {
      const patch: CanvasesUpdate = {};
      if (title !== undefined) patch.title = title;
      if (scene !== undefined) patch.scene = scene as Json;
      if (position !== undefined) patch.position = position;

      let query = supabase.from("canvases").update(patch).eq("id", id);
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
      return mapCanvasRow(data);
    },
    onSuccess: (canvas, variables) => {
      queryClient.setQueryData<Canvas>(["canvas", canvas.id], canvas);
      // Same rationale as useUpdatePage's onSuccess — useCanvases only renders title/position,
      // so skip invalidating it on a scene-only autosave.
      const { title, position } = variables;
      if (title !== undefined || position !== undefined) {
        queryClient.invalidateQueries({
          queryKey: ["canvases", canvas.workspaceId],
        });
      }
    },
  });
}
