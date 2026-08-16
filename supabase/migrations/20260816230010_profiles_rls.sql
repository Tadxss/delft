-- RLS for `profiles`. Unlike every workspace-scoped table (which keys off `workspace_members`
-- membership), a profile has exactly one owner and no sharing concept — so this mirrors
-- `workspaces_update_owner`'s direct `owner_id = auth.uid()` template (the closest existing
-- non-membership-table precedent) rather than a membership join.
--
-- No delete policy: nothing in the app deletes a profile row directly — `on delete cascade` from
-- `auth.users` already handles account removal, and there's no "clear my profile" UI planned.
alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy profiles_insert_own on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- auto_expose_new_tables is off — a GRANT is required in addition to the RLS policies above, or
-- every query fails with "permission denied for table profiles" before RLS is even evaluated.
grant select, insert, update on public.profiles to authenticated;
