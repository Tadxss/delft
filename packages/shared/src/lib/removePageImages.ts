import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@crowscribe/types";

// Storage objects aren't foreign-keyed to Postgres, so `on delete cascade` on pages/workspaces
// never cleans up the `page-images` bucket — BETA_READINESS.md's Storage-orphaning finding. Called
// by useDeletePage/useDeleteWorkspace *before* their row delete: page_images_delete_member's RLS
// (supabase/migrations/20260812140030_storage.sql) scopes on the caller still being a member of
// the workspace named by the object path's first segment, which a completed row delete would
// already have cascaded away.
//
// Best-effort by design: caught and logged rather than rethrown. This is a slow leak against the
// 1GB free tier, not a correctness requirement — blocking a user from deleting a page/workspace
// they want gone because of a transient Storage hiccup would be a worse tradeoff than occasionally
// leaving an object behind.
export async function removePageImages(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  pageIds: string[],
): Promise<void> {
  try {
    const paths: string[] = [];
    for (const pageId of pageIds) {
      const prefix = `${workspaceId}/${pageId}`;
      const { data: files, error } = await supabase.storage
        .from("page-images")
        .list(prefix);
      if (error) throw error;
      for (const file of files ?? []) {
        paths.push(`${prefix}/${file.name}`);
      }
    }
    if (paths.length > 0) {
      const { error } = await supabase.storage
        .from("page-images")
        .remove(paths);
      if (error) throw error;
    }
  } catch (error) {
    console.error(
      "removePageImages: failed to clean up page-images Storage objects",
      error,
    );
  }
}
