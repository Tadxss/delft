import { useQuery } from "@tanstack/react-query";
import type { CanvasSummary } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCanvasSummaryRow } from "../supabase/mappers";

// Columns the sidebar list actually renders (id/title), plus the rest of Canvas minus its jsonb
// `scene` — same rationale as usePages.ts's PAGE_SUMMARY_COLUMNS. Full scene is only ever needed
// by useCanvas.ts, for the one canvas currently open.
const CANVAS_SUMMARY_COLUMNS =
  "id, workspace_id, title, position, created_at, updated_at";

// Direct RLS-gated read — canvases_select_member already limits this to the caller's own
// workspace. Flat list (no parent_id/tree, unlike pages) — canvases are standalone items.
export function useCanvases(workspaceId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<CanvasSummary[]>({
    queryKey: ["canvases", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("canvases")
        .select(CANVAS_SUMMARY_COLUMNS)
        .eq("workspace_id", workspaceId as string)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapCanvasSummaryRow);
    },
  });
}
