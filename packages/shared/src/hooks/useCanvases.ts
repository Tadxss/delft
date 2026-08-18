import { useQuery } from "@tanstack/react-query";
import type { Canvas } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCanvasRow } from "../supabase/mappers";

// Direct RLS-gated read — canvases_select_member already limits this to the caller's own
// workspace. Flat list (no parent_id/tree, unlike pages) — canvases are standalone items.
export function useCanvases(workspaceId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<Canvas[]>({
    queryKey: ["canvases", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("canvases")
        .select("*")
        .eq("workspace_id", workspaceId as string)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapCanvasRow);
    },
  });
}
