import { useQuery } from "@tanstack/react-query";
import type { Canvas } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCanvasRow } from "../supabase/mappers";

export function useCanvas(canvasId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<Canvas | null>({
    queryKey: ["canvas", canvasId],
    enabled: Boolean(canvasId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("canvases")
        .select("*")
        .eq("id", canvasId as string)
        .maybeSingle();
      if (error) throw error;
      return data ? mapCanvasRow(data) : null;
    },
  });
}
