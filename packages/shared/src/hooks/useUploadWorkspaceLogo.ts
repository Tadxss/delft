import { useMutation } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Raw storage upload for a workspace's logo — direct copy of useUploadAvatar, keyed by workspace
// instead of user. Fixed path `{workspaceId}/logo.webp` with `upsert: true` so re-uploads
// overwrite in place (no orphan cleanup); compression happens in apps/web before this is called.
// The `workspace-logos` bucket's write RLS scopes on workspace membership via the path's first
// segment (see supabase/migrations/20260828033527_workspace_logo.sql). Caller saves the returned
// URL onto workspaces.logo_url via useUpdateWorkspace.
export function useUploadWorkspaceLogo() {
  const supabase = useSupabaseClient();

  return useMutation<string, Error, { workspaceId: string; file: Blob }>({
    mutationFn: async ({ workspaceId, file }) => {
      const path = `${workspaceId}/logo.webp`;
      const { error } = await supabase.storage
        .from("workspace-logos")
        .upload(path, file, { contentType: "image/webp", upsert: true });
      if (error) throw error;
      const { data } = supabase.storage
        .from("workspace-logos")
        .getPublicUrl(path);
      // Cache-bust — the object path is stable across re-uploads, so without a fresh query param
      // the browser/CDN keeps serving the previous image.
      return `${data.publicUrl}?v=${Date.now()}`;
    },
  });
}
