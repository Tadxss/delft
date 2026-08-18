import { useMutation } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Raw storage upload — the compress/strip-EXIF/convert-to-WebP step (browser-image-compression)
// happens in apps/web, right before this is called from BlockNote's `uploadFile` option, so this
// hook only knows about the already-processed Blob and where it goes. Path convention:
// `{workspaceId}/{pageId}/{uuid}.webp` (see supabase/migrations' storage migration, which scopes
// write RLS to this exact first-segment-is-workspace-id shape).
export function useUploadPageImage() {
  const supabase = useSupabaseClient();

  return useMutation<
    string,
    Error,
    { workspaceId: string; pageId: string; file: Blob }
  >({
    mutationFn: async ({ workspaceId, pageId, file }) => {
      const path = `${workspaceId}/${pageId}/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage
        .from("page-images")
        .upload(path, file, { contentType: "image/webp" });
      if (error) throw error;
      const { data } = supabase.storage.from("page-images").getPublicUrl(path);
      return data.publicUrl;
    },
  });
}
