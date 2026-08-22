import { queryOptions, useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Page } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapPageRow } from "../supabase/mappers";
import { STALE_TIME_ACTIVE_ITEM } from "../queryConfig";

// Shared between usePage below and the sidebar's hover/focus prefetch (PageTreeNode.tsx) so the
// two can never drift apart — the prefetch call must use the exact same queryKey/queryFn this hook
// reads from, or it'd just populate a cache entry usePage never looks at.
export function pageQueryOptions(
  supabase: SupabaseClient<Database>,
  pageId: string,
) {
  return queryOptions<Page | null>({
    queryKey: ["page", pageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pages")
        .select("*")
        .eq("id", pageId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapPageRow(data) : null;
    },
    staleTime: STALE_TIME_ACTIVE_ITEM,
  });
}

export function usePage(pageId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery({
    ...pageQueryOptions(supabase, pageId ?? ""),
    enabled: Boolean(pageId),
  });
}
