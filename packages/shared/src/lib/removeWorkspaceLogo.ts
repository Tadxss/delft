import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@crowscribe/types";

// The `workspace-logos` bucket uses a fixed path (`{workspaceId}/logo.webp`, upsert) so uploads
// never orphan — but nulling/replacing `workspaces.logo_url` (Remove, or pasting an external URL)
// and deleting a workspace both leave that object behind. Same shape and rationale as
// removePageImages: best-effort, catch-and-log, never rethrow — a stuck Storage call must not
// block the user from removing a logo or deleting a workspace, and it's a tiny leak either way.
//
// Called before the row delete in useDeleteWorkspace (the `workspace_logos_delete_member` policy
// needs the caller to still be a workspace member, which a completed workspace delete cascades
// away), and after the row update in useUpdateWorkspace (plain UPDATE keeps membership, so order
// doesn't matter there).
export async function removeWorkspaceLogo(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<void> {
  try {
    const { error } = await supabase.storage
      .from("workspace-logos")
      .remove([`${workspaceId}/logo.webp`]);
    if (error) throw error;
  } catch (error) {
    console.error(
      "removeWorkspaceLogo: failed to clean up the workspace-logos Storage object",
      error,
    );
  }
}
