-- RLS policies + grants for the `credentials` table (see paired *_credentials.sql for schema).
-- Same member-based pattern as `pages` (see 20260812140010_rls.sql's comments for the full
-- `to authenticated` scoping rationale — unscoped policies get evaluated for anon too and throw a
-- hard "permission denied for table workspace_members" instead of just filtering to zero rows).
--
-- Unlike `pages`, there is no anon policy and no anon grant at all — credentials have no public
-- share surface, ever.

alter table public.credentials enable row level security;

create policy credentials_select_member on public.credentials
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = credentials.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy credentials_insert_member on public.credentials
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = credentials.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy credentials_update_member on public.credentials
  for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = credentials.workspace_id and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = credentials.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy credentials_delete_member on public.credentials
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = credentials.workspace_id and wm.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.credentials to authenticated;
