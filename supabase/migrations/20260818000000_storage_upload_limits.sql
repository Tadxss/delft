-- Locks down `page-images`/`avatars` Storage bucket uploads at the server, not just via the app's
-- own client-side browser-image-compression step (trivially bypassed by calling the Storage API
-- directly with the same anon key + session). No new table, so no companion GRANT needed here.
--
-- 5 MiB is generous headroom over what browser-image-compression actually produces (max 1920px,
-- forced webp) — this is a backstop against a client that skips compression entirely, not a tight
-- bound on the normal upload path. No image/svg+xml: SVG can embed <script>, and both buckets are
-- public-read, so an uploaded SVG would execute as active content at its own public URL.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg']
where id in ('page-images', 'avatars');
