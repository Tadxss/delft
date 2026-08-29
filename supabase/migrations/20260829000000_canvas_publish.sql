-- Canvas sharing: mirrors the Pages publish/share model (pages.is_published / published_slug +
-- pages_select_published_anon, see 20260812140000_init.sql and 20260812140010_rls.sql). Publishing
-- a canvas flips is_published = true and stamps an unguessable published_slug; the anon-readable
-- policy below is what actually makes the row fetchable at /share/canvas/[slug], nothing the client
-- does. Re-publishing reuses the same slug (the client only clears is_published on unpublish, never
-- the slug — a non-null slug carries no access implication by itself).

alter table public.canvases
  add column is_published   boolean not null default false,
  add column published_slug text unique;

-- The one deliberate anon read path for canvases — same shape and same caveats as
-- pages_select_published_anon: scoped strictly to `is_published = true` (an unpublished canvas with
-- a leftover slug stays private), no workspace-membership check, and it MUST never be paired with
-- an anon grant on `workspaces` or `workspace_members`. Scoped `to anon` so authenticated requests
-- keep going through canvases_select_member unchanged.
create policy canvases_select_published_anon on public.canvases
  for select
  to anon
  using (is_published = true);

-- RLS is not a grant: `anon` needs an explicit SELECT privilege on the table for the policy above
-- to ever be reached (auto_expose_new_tables is off). SELECT only — no anon insert/update/delete.
grant select on public.canvases to anon;
