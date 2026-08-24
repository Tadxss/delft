import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Page } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapPageRow } from "../supabase/mappers";

// Flips is_published back to false. Deliberately keeps published_slug on the row instead of
// clearing it — re-publishing later reuses the same link rather than generating a new one, and
// `published_slug` being non-null carries no access implication by itself: only `is_published`
// gates pages_select_published_anon.
export function useUnpublishPage() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Page, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const { data, error } = await supabase
        .from("pages")
        .update({ is_published: false })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapPageRow(data);
    },
    onSuccess: (page) => {
      queryClient.setQueryData<Page>(["page", page.id], page);
      queryClient.invalidateQueries({ queryKey: ["pages", page.workspaceId] });
    },
  });
}
