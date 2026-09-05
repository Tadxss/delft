import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@crowscribe/types";

export interface DuplicatedPageRow {
  old_id: string;
  new_id: string;
  is_root: boolean;
  workspace_id: string;
  content: Json;
}

// Companion to useDuplicatePage.ts's RPC call. `duplicate_page` (supabase/migrations) copies the
// `pages` rows themselves but has no way to touch Storage from SQL, so each duplicated page's
// content still embeds image URLs pointing at the ORIGINAL page's `page-images/{workspaceId}/
// {oldPageId}/...` objects. Left alone, those images would silently 404 the moment the original
// page (or its images) is later deleted via useDeletePage's removePageImages cleanup — this walks
// every duplicated page, copies its images to its own new path, and rewrites `content` to match.
//
// Best-effort by design, matching removePageImages.ts's stance: a Storage hiccup here shouldn't
// undo an already-successful row duplication (the pages themselves are already real and usable,
// just still borrowing the original's images) — caught and logged per page, never rethrown.
export async function duplicatePageImages(
  supabase: SupabaseClient<Database>,
  rows: DuplicatedPageRow[],
): Promise<void> {
  for (const row of rows) {
    try {
      const oldPrefix = `${row.workspace_id}/${row.old_id}`;
      const newPrefix = `${row.workspace_id}/${row.new_id}`;
      const { data: files, error: listError } = await supabase.storage
        .from("page-images")
        .list(oldPrefix);
      if (listError) throw listError;
      if (!files || files.length === 0) continue;

      for (const file of files) {
        const { error: copyError } = await supabase.storage
          .from("page-images")
          .copy(`${oldPrefix}/${file.name}`, `${newPrefix}/${file.name}`);
        if (copyError) throw copyError;
      }

      // Blind substring swap, not a block-schema-aware parse: the old page id only ever appears
      // inside this one unambiguous Storage path shape, wherever an image block references it.
      const rewritten = JSON.parse(
        JSON.stringify(row.content).split(`page-images/${oldPrefix}/`).join(
          `page-images/${newPrefix}/`,
        ),
      ) as Json;

      const { error: updateError } = await supabase
        .from("pages")
        .update({ content: rewritten })
        .eq("id", row.new_id);
      if (updateError) throw updateError;
    } catch (error) {
      console.error(
        "duplicatePageImages: failed to copy images for a duplicated page",
        error,
      );
    }
  }
}
