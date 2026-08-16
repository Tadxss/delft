import { useMutation } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Raw storage upload, mirroring useUploadPageImage's shape — compression happens in apps/web
// before this is called. Fixed path per user (`{userId}/avatar.webp`, not a random uuid) with
// `upsert: true` deliberately: every re-upload overwrites the same object in place rather than
// accumulating orphaned old avatar files with no cleanup mechanism (see
// supabase/migrations/20260816230020_avatars_storage.sql).
export function useUploadAvatar() {
  const supabase = useSupabaseClient();

  return useMutation<string, Error, { userId: string; file: Blob }>({
    mutationFn: async ({ userId, file }) => {
      const path = `${userId}/avatar.webp`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: "image/webp", upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust the public URL — the object path never changes on re-upload (deliberate, see
      // above), so without a query param the browser/CDN would keep serving the previous image
      // even though the underlying file changed.
      return `${data.publicUrl}?v=${Date.now()}`;
    },
  });
}
