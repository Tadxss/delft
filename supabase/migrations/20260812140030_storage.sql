-- `page-images` Storage bucket for BlockNote image uploads. Path convention:
-- `{workspace_id}/{page_id}/{uuid}.webp` (enforced app-side, see packages/shared's
-- useUpdatePage-adjacent upload hook — the first path segment is the workspace id, used below to
-- scope write access).
--
-- Tradeoff, documented deliberately: the bucket is created PUBLIC (`public = true`), so any
-- object's public URL is fetchable by anyone who has it, with no per-object RLS check on read —
-- same as votero's `lobby-logos` bucket. The alternative (a private bucket + a `pages_select_
-- published_anon`-style read policy keyed off whether the owning page is published) would let an
-- unpublished page's images stay unguessable, but page-image URLs are long random UUIDs already
-- (not enumerable), this is a personal single-owner tool rather than a multi-tenant SaaS with
-- untrusted workspaces, and a private bucket would also require a signed-URL refresh path in the
-- BlockNote editor for every image render. Public-read + workspace-scoped writes is the simpler
-- correct tradeoff for v1; revisit if CrowScribe ever gets untrusted collaborators.
insert into storage.buckets (id, name, public)
values ('page-images', 'page-images', true)
on conflict (id) do nothing;

-- Writes (insert/update/delete) are restricted to members of the workspace named by the object
-- path's first folder segment — `storage.foldername(name)` splits the object key on `/` and
-- returns the folder segments, so `(storage.foldername(name))[1]` is the `{workspace_id}` prefix.
create policy page_images_insert_member on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'page-images'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );

create policy page_images_update_member on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'page-images'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );

create policy page_images_delete_member on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'page-images'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );

-- Reads: the bucket is public, so Supabase's public-URL endpoint serves objects without going
-- through storage.objects RLS at all. This SELECT policy only matters for the small surface that
-- still queries the Storage *API* directly (e.g. listing a workspace's images as an authenticated
-- member) rather than fetching the public URL — kept narrow (member-only) even though the public
-- URL path bypasses it, so the API surface isn't wider than the intended public-read tradeoff
-- above implies.
create policy page_images_select_member on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'page-images'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );
