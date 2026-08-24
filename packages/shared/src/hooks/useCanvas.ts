import { queryOptions, useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Canvas, Database } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCanvasRow } from "../supabase/mappers";
import { STALE_TIME_ACTIVE_ITEM } from "../queryConfig";

// Shared between useCanvas below and the sidebar's hover/focus prefetch (Sidebar.tsx's CanvasRow)
// so the two can never drift apart — see usePage.ts's pageQueryOptions for the same rationale.
export function canvasQueryOptions(
  supabase: SupabaseClient<Database>,
  canvasId: string,
) {
  return queryOptions<Canvas | null>({
    queryKey: ["canvas", canvasId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("canvases")
        .select("*")
        .eq("id", canvasId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapCanvasRow(data) : null;
    },
    staleTime: STALE_TIME_ACTIVE_ITEM,
  });
}

export function useCanvas(canvasId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery({
    ...canvasQueryOptions(supabase, canvasId ?? ""),
    enabled: Boolean(canvasId),
  });
}
