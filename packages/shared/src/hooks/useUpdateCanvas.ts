import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Canvas, Database, Json } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCanvasRow } from "../supabase/mappers";

type CanvasesUpdate = Database["public"]["Tables"]["canvases"]["Update"];

export interface UpdateCanvasInput {
  id: string;
  title?: string;
  scene?: unknown;
  position?: number;
}

// Backs both the title field and the canvas autosave (apps/web debounces calls to this hook,
// same ~800ms pattern as useUpdatePage — no debounce logic lives here). `updated_at` is
// maintained server-side by canvases_set_updated_at, not passed in.
export function useUpdateCanvas() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Canvas, Error, UpdateCanvasInput>({
    mutationFn: async ({ id, title, scene, position }) => {
      const patch: CanvasesUpdate = {};
      if (title !== undefined) patch.title = title;
      if (scene !== undefined) patch.scene = scene as Json;
      if (position !== undefined) patch.position = position;

      const { data, error } = await supabase
        .from("canvases")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
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
