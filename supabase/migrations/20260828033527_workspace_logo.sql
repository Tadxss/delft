-- Per-workspace logo. `workspaces.logo_url` holds the public URL of an uploaded image (or null,
-- in which case the UI falls back to the workspace's initials). The image itself lives in a new
-- public `workspace-logos` Storage bucket at `{workspace_id}/logo.webp` (fixed path, overwritten
-- in place on re-upload — same shape as the `avatars` bucket).
--
-- No RLS/grant changes for the column — same reasoning as every vault-column migration: it's just
-- another column on `workspaces`, already covered by workspaces_update_owner for select + update
-- and by the existing `grant select, insert, update on public.workspaces to authenticated`.

alter table public.workspaces
  add column logo_url text
  check (logo_url is null or char_length(logo_url) <= 2000);

-- `workspace-logos` Storage bucket. Public-read + workspace-scoped writes, identical tradeoff and
-- structure to `page-images` (20260812140030_storage.sql) — the write policies gate on membership
-- of the workspace named by the object path's first folder segment, `(storage.foldername(name))[1]`.
insert into storage.buckets (id, name, public)
values ('workspace-logos', 'workspace-logos', true)
on conflict (id) do nothing;

create policy workspace_logos_insert_member on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'workspace-logos'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );

create policy workspace_logos_update_member on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'workspace-logos'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );

create policy workspace_logos_delete_member on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'workspace-logos'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );

create policy workspace_logos_select_member on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'workspace-logos'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );

-- Same size/MIME clamp as page-images and avatars (20260818000000_storage_upload_limits.sql):
-- 5 MiB, raster only (no SVG — script-execution risk on a public bucket).
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg']
where id = 'workspace-logos';
