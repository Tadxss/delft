import { useQuery } from "@tanstack/react-query";
import type { PageSummary } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapPageSummaryRow } from "../supabase/mappers";

// Columns the sidebar tree actually renders (id/title/parentId/position) plus the rest of Page
// minus its jsonb `content` — deliberately excludes `content` since a page's full BlockNote
// document can be large and this list is refetched on every title/reparent/reorder across the
// whole workspace (see useUpdatePage.ts's invalidation). Full content is only ever needed by
// usePage.ts, for the one page currently open.
const PAGE_SUMMARY_COLUMNS =
  "id, workspace_id, parent_id, title, is_published, published_slug, position, created_at, updated_at";

export interface UsePagesOptions {
  // Filter to direct children of a specific parent (including `null` for top-level pages). Leave
  // undefined to fetch every page in the workspace at once — the sidebar tree wants the whole set
  // in one query and builds the parent_id tree client-side, rather than one query per expand.
  parentId?: string | null;
}

// Direct RLS-gated read — pages_select_member already limits this to the caller's own workspace.
export function usePages(
  workspaceId: string | undefined,
  options: UsePagesOptions = {},
) {
  const supabase = useSupabaseClient();
  const { parentId } = options;

  return useQuery<PageSummary[]>({
    queryKey: ["pages", workspaceId, parentId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      let query = supabase
        .from("pages")
        .select(PAGE_SUMMARY_COLUMNS)
        .eq("workspace_id", workspaceId as string)
        .order("position", { ascending: true });

      if (parentId !== undefined) {
        query =
          parentId === null
            ? query.is("parent_id", null)
            : query.eq("parent_id", parentId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(mapPageSummaryRow);
    },
  });
}
