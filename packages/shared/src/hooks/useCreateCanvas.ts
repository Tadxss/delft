import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Canvas } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCanvasRow } from "../supabase/mappers";

export interface CreateCanvasInput {
  workspaceId: string;
  title?: string;
}

// Plain RLS-gated insert (canvases_insert_member). Leaves `scene` at its column default
// ({elements:[],appState:{}}) — a brand-new canvas has nothing drawn yet.
export function useCreateCanvas() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Canvas, Error, CreateCanvasInput>({
    mutationFn: async ({ workspaceId, title = "" }) => {
      const { data, error } = await supabase
        .from("canvases")
        .insert({ workspace_id: workspaceId, title })
        .select()
        .single();
      if (error) throw error;
      return mapCanvasRow(data);
    },
    onSuccess: (canvas) => {
      queryClient.invalidateQueries({
        queryKey: ["canvases", canvas.workspaceId],
      });
    },
  });
}
