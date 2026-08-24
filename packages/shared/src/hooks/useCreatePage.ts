import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Page } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapPageRow } from "../supabase/mappers";

export interface CreatePageInput {
  workspaceId: string;
  parentId?: string | null;
  title?: string;
}

// Plain RLS-gated insert (pages_insert_member) — nothing here needs a SECURITY DEFINER RPC, unlike
// workspace creation, since a page never needs to touch a table the client can't already write
// directly.
export function useCreatePage() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Page, Error, CreatePageInput>({
    mutationFn: async ({ workspaceId, parentId = null, title = "" }) => {
      const { data, error } = await supabase
        .from("pages")
        .insert({ workspace_id: workspaceId, parent_id: parentId, title })
        .select()
        .single();
      if (error) throw error;
      return mapPageRow(data);
    },
    onSuccess: (page) => {
      queryClient.invalidateQueries({ queryKey: ["pages", page.workspaceId] });
    },
  });
}
