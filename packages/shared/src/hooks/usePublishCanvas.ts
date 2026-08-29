import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Canvas } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCanvasRow } from "../supabase/mappers";

function generateSlug(): string {
  // Short, URL-safe, unguessable enough for a personal share link — same rationale as
  // usePublishPage's generateSlug (not meant to resist targeted brute-forcing).
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

// Sets is_published = true and (if not already set) a published_slug, via the RLS-gated
// canvases_update_member policy — the anon-readable canvases_select_published_anon policy is what
// actually makes the row fetchable at /share/canvas/[slug], not anything this hook does. Mirrors
// usePublishPage.
export function usePublishCanvas() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<
    Canvas,
    Error,
    { id: string; existingSlug?: string | null }
  >({
    mutationFn: async ({ id, existingSlug }) => {
      const { data, error } = await supabase
        .from("canvases")
        .update({
          is_published: true,
          published_slug: existingSlug ?? generateSlug(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapCanvasRow(data);
    },
    onSuccess: (canvas) => {
      queryClient.setQueryData<Canvas>(["canvas", canvas.id], canvas);
      queryClient.invalidateQueries({
        queryKey: ["canvases", canvas.workspaceId],
      });
    },
  });
}
