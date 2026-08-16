-- RLS policies + grants for credential_folders (see paired *_credential_folders.sql for schema).
-- Exact same member-based pattern as `credentials`/`pages` — see 20260812140010_rls.sql's comments
-- for the `to authenticated` scoping rationale. No recursion needed even though the table is
-- self-referencing for the tree: every row independently satisfies the same flat
-- workspace_members check regardless of depth, same as pages.parent_id.
--
-- No anon policy and no anon grant — folders inherit credentials' "no public share surface, ever."

alter table public.credential_folders enable row level security;

create policy credential_folders_select_member on public.credential_folders
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = credential_folders.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy credential_folders_insert_member on public.credential_folders
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = credential_folders.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy credential_folders_update_member on public.credential_folders
  for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = credential_folders.workspace_id and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = credential_folders.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy credential_folders_delete_member on public.credential_folders
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = credential_folders.workspace_id and wm.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.credential_folders to authenticated;
