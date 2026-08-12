import { useQuery } from "@tanstack/react-query";
import type { Page } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapPageRow } from "../supabase/mappers";

export function usePage(pageId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<Page | null>({
    queryKey: ["page", pageId],
    enabled: Boolean(pageId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pages")
        .select("*")
        .eq("id", pageId as string)
        .maybeSingle();
      if (error) throw error;
      return data ? mapPageRow(data) : null;
    },
  });
}
