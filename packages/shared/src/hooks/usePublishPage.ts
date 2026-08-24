import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Page } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapPageRow } from "../supabase/mappers";

function generateSlug(): string {
  // Short, URL-safe, unguessable enough for a personal share link (not meant to resist targeted
  // brute-forcing, matching page-images' "long random path" reasoning — see the storage
  // migration's comment). crypto.randomUUID() is available in both the browser and Node 20+.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

// Sets is_published = true and (if not already set) a published_slug, via the plain RLS-gated
// update policy (pages_update_member) — the anon-readable pages_select_published_anon policy is
// what actually makes the resulting row fetchable at /share/[slug], not anything this hook does.
export function usePublishPage() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Page, Error, { id: string; existingSlug?: string | null }>(
    {
      mutationFn: async ({ id, existingSlug }) => {
        const { data, error } = await supabase
          .from("pages")
          .update({
            is_published: true,
            published_slug: existingSlug ?? generateSlug(),
          })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return mapPageRow(data);
      },
      onSuccess: (page) => {
        queryClient.setQueryData<Page>(["page", page.id], page);
        queryClient.invalidateQueries({
          queryKey: ["pages", page.workspaceId],
        });
      },
    },
  );
}
