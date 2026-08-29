import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Canvas } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCanvasRow } from "../supabase/mappers";

// Flips is_published back to false, keeping published_slug on the row so re-publishing reuses the
// same link — same rationale as useUnpublishPage (only is_published gates
// canvases_select_published_anon).
export function useUnpublishCanvas() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Canvas, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const { data, error } = await supabase
        .from("canvases")
        .update({ is_published: false })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapCanvasRow(data);
    },
    onSuccess: (canvas) => {
      queryClient.setQueryData<Canvas>(["canvas", canvas.id], canvas);
      queryClient.invalidateQueries({
        queryKey: ["canvases", canvas.workspaceId],
      });
    },
  });
}
