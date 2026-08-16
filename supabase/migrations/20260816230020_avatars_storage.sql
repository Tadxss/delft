-- `avatars` Storage bucket for profile pictures. Path convention: `{user_id}/avatar.webp` — a
-- FIXED filename per user (not a random uuid like page-images), deliberately: every re-upload
-- overwrites the same object in place (uploaded with `{ upsert: true }` app-side) rather than
-- accumulating orphaned old avatar files with no cleanup mechanism, a real concern against
-- Supabase Storage's free-tier 1GB cap.
--
-- Public read (same tradeoff as page-images — see that bucket's migration for the reasoning),
-- writes scoped to the user's own folder via `(storage.foldername(name))[1] = auth.uid()::text`,
-- the one deviation from page-images' policy shape (workspace-membership vs. plain user-id match).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy avatars_insert_own on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_update_own on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_delete_own on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Reads: bucket is public, so the public-URL endpoint bypasses this — kept narrow (own-file-only)
-- for the same reason page_images_select_member is, matching that bucket's policy exactly.
create policy avatars_select_own on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
