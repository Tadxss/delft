-- RLS policies + grants for the `canvases` table (see paired *_canvases.sql for schema).
-- Same member-based pattern as `pages` (see 20260812140010_rls.sql's comments for the full
-- `to authenticated` scoping rationale). No anon policy and no anon grant at all — canvases have
-- no public share surface in v1, unlike `pages`' /share/[slug].

alter table public.canvases enable row level security;

create policy canvases_select_member on public.canvases
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = canvases.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy canvases_insert_member on public.canvases
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = canvases.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy canvases_update_member on public.canvases
  for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = canvases.workspace_id and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = canvases.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy canvases_delete_member on public.canvases
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = canvases.workspace_id and wm.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.canvases to authenticated;
