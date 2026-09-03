-- Per-member vaults in shared workspaces (Build Order step 92).
--
-- Until now a workspace had ONE credentials vault, keyed to the owner's passphrase: the
-- wrapped-master-key columns lived on `workspaces`, and credentials/credential_folders RLS was
-- `has_workspace_access(ws, ['owner'])` — editors/viewers saw zero credential rows, and
-- `transfer_workspace_ownership` refused while a vault existed (the VMK can't be re-wrapped for
-- another user).
--
-- New model: the owner's vault is no longer special. Every member of any role gets ONE optional
-- private vault per workspace — their own passphrase, their own credential rows, invisible to
-- everyone else including the owner. The key-wrap material moves off `workspaces` into a new
-- per-(workspace, user) `workspace_vaults` table; `credentials` / `credential_folders` gain a
-- `user_id` owner column and their RLS becomes "your own rows, in a workspace you belong to".
--
-- This migration is behavior-neutral for the app UI (the "Credentials Vault" menu item stays
-- owner-only for now — PR 2 opens it to every member). It's all-or-nothing: Postgres runs DDL
-- transactionally, so a failure anywhere rolls the whole thing back with no half-migrated state.
--
-- Legacy note: the pre-wrapped-key ("direct key") vault model is fully gone (0 such vaults in
-- production since 20260823141028_drop_vault_verifier.sql). `migrate_vault_to_wrapped_key` is
-- dropped here as dead code — it referenced `workspaces.vault_wrapped_key`, which this migration
-- removes.


-- ===========================================================================================
-- 1. workspace_vaults — one row per (workspace, member) who has set up a vault.
-- ===========================================================================================

create table public.workspace_vaults (
  workspace_id                   uuid not null references public.workspaces(id) on delete cascade,
  -- `on delete cascade` to auth.users: deleting an account (delete-account Edge Function) takes
  -- that member's vault in every workspace with it. `default auth.uid()` so the client never
  -- supplies its own id (and can't get it wrong) — the insert policy's with_check requires it.
  user_id                        uuid not null references auth.users(id) on delete cascade default auth.uid(),
  -- All five are set together, in one write (useSetVaultWrappedKey) — never a salt without the
  -- wrapped key alongside it, so `not null` on every column. See packages/shared/src/lib/vaultCrypto.ts
  -- for what each holds (PBKDF2 salt; the VMK wrapped under the passphrase-derived key; the VMK
  -- wrapped under the one-time recovery key).
  vault_salt                     text not null,
  vault_wrapped_key              text not null,
  vault_wrapped_key_iv           text not null,
  vault_recovery_wrapped_key     text not null,
  vault_recovery_wrapped_key_iv  text not null,
  created_at                     timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.workspace_vaults enable row level security;

-- Self-only, `to authenticated` (an unscoped policy subqueries workspace_members, which anon has
-- no grant on — that throws a hard permission error for anon instead of filtering to zero rows;
-- see 20260812140010_rls.sql). Goes through has_workspace_access (SECURITY INVOKER helper), never
-- a raw workspace_members subquery — same pattern as pages/canvases, and it keeps invariant #3
-- (never subquery workspace_members from a policy *on* workspace_members) irrelevant here.
create policy workspace_vaults_select_self on public.workspace_vaults
  for select to authenticated
  using (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  );

create policy workspace_vaults_insert_self on public.workspace_vaults
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  );

create policy workspace_vaults_update_self on public.workspace_vaults
  for update to authenticated
  using (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  )
  with check (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  );

create policy workspace_vaults_delete_self on public.workspace_vaults
  for delete to authenticated
  using (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  );

-- Reminder: a new table needs an explicit GRANT on top of RLS (auto_expose_new_tables is off).
grant select, insert, update, delete on public.workspace_vaults to authenticated;


-- ===========================================================================================
-- 2. Migrate the existing owner vault(s) into workspace_vaults, then drop the workspaces columns.
--    Production has exactly one; local/CI have none. `vault_wrapped_key is not null` is the
--    "vault has been set up" test (all five columns move together or not at all).
-- ===========================================================================================

insert into public.workspace_vaults (
  workspace_id, user_id,
  vault_salt, vault_wrapped_key, vault_wrapped_key_iv,
  vault_recovery_wrapped_key, vault_recovery_wrapped_key_iv
)
select
  w.id, w.owner_id,
  w.vault_salt, w.vault_wrapped_key, w.vault_wrapped_key_iv,
  w.vault_recovery_wrapped_key, w.vault_recovery_wrapped_key_iv
from public.workspaces w
where w.vault_wrapped_key is not null;

alter table public.workspaces drop column vault_salt;
alter table public.workspaces drop column vault_wrapped_key;
alter table public.workspaces drop column vault_wrapped_key_iv;
alter table public.workspaces drop column vault_recovery_wrapped_key;
alter table public.workspaces drop column vault_recovery_wrapped_key_iv;


-- ===========================================================================================
-- 3. credentials / credential_folders: add user_id (owner of the row), backfill, lock down RLS.
-- ===========================================================================================

alter table public.credentials
  add column user_id uuid references auth.users(id) on delete cascade;
alter table public.credential_folders
  add column user_id uuid references auth.users(id) on delete cascade;

-- Backfill every existing row to the workspace owner (the only person who could have created a
-- credential under the old owner-only model). workspaces.owner_id is NOT NULL, so this can never
-- leave a row with a null user_id — the assertions below prove it before we add the constraint.
update public.credentials c
  set user_id = w.owner_id
  from public.workspaces w
  where w.id = c.workspace_id;
update public.credential_folders f
  set user_id = w.owner_id
  from public.workspaces w
  where w.id = f.workspace_id;

do $$
begin
  if exists (select 1 from public.credentials where user_id is null) then
    raise exception 'backfill left credentials with a null user_id';
  end if;
  if exists (select 1 from public.credential_folders where user_id is null) then
    raise exception 'backfill left credential_folders with a null user_id';
  end if;
end $$;

alter table public.credentials  alter column user_id set not null;
alter table public.credentials  alter column user_id set default auth.uid();
alter table public.credential_folders  alter column user_id set not null;
alter table public.credential_folders  alter column user_id set default auth.uid();

create index credentials_user_id_idx on public.credentials(user_id);
create index credential_folders_user_id_idx on public.credential_folders(user_id);

-- RLS: "your own rows, in a workspace you belong to (any role)". `user_id` fills from the
-- `default auth.uid()` on insert — the client never sends it — so the with_check passes for a
-- normal create. Replaces the owner-only policies from 20260830000000_workspace_invitations.sql.
drop policy credentials_select_member on public.credentials;
drop policy credentials_insert_member on public.credentials;
drop policy credentials_update_member on public.credentials;
drop policy credentials_delete_member on public.credentials;

create policy credentials_select_own on public.credentials
  for select to authenticated
  using (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  );
create policy credentials_insert_own on public.credentials
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  );
create policy credentials_update_own on public.credentials
  for update to authenticated
  using (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  )
  with check (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  );
create policy credentials_delete_own on public.credentials
  for delete to authenticated
  using (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  );

drop policy credential_folders_select_member on public.credential_folders;
drop policy credential_folders_insert_member on public.credential_folders;
drop policy credential_folders_update_member on public.credential_folders;
drop policy credential_folders_delete_member on public.credential_folders;

create policy credential_folders_select_own on public.credential_folders
  for select to authenticated
  using (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  );
create policy credential_folders_insert_own on public.credential_folders
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  );
create policy credential_folders_update_own on public.credential_folders
  for update to authenticated
  using (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  )
  with check (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  );
create policy credential_folders_delete_own on public.credential_folders
  for delete to authenticated
  using (
    user_id = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  );


-- ===========================================================================================
-- 4. Folder-parent integrity triggers: also require the parent to belong to the SAME member.
--    RLS already blocks referencing another member's folder id (they can't SELECT it, so the
--    trigger's lookup finds nothing → "parent folder does not exist"), but making the same-owner
--    rule explicit keeps the guarantee independent of RLS evaluation order.
-- ===========================================================================================

create or replace function public.check_credential_folder_parent()
returns trigger
language plpgsql
as $$
declare
  parent_workspace_id uuid;
  parent_user_id uuid;
begin
  if new.parent_folder_id is null then
    return new;
  end if;

  if new.parent_folder_id = new.id then
    raise exception 'a folder cannot be its own parent';
  end if;

  select workspace_id, user_id into parent_workspace_id, parent_user_id
  from public.credential_folders
  where id = new.parent_folder_id;

  if parent_workspace_id is null then
    raise exception 'parent folder does not exist';
  end if;

  if parent_workspace_id <> new.workspace_id then
    raise exception 'parent folder must belong to the same workspace';
  end if;

  if parent_user_id <> new.user_id then
    raise exception 'parent folder must belong to the same member';
  end if;

  if exists (
    with recursive descendants as (
      select id from public.credential_folders where parent_folder_id = new.id
      union all
      select cf.id from public.credential_folders cf
      join descendants d on cf.parent_folder_id = d.id
    )
    select 1 from descendants where id = new.parent_folder_id
  ) then
    raise exception 'cannot move a folder into its own descendant';
  end if;

  return new;
end;
$$;

create or replace function public.check_credential_folder_workspace()
returns trigger
language plpgsql
as $$
declare
  folder_workspace_id uuid;
  folder_user_id uuid;
begin
  if new.folder_id is null then
    return new;
  end if;

  select workspace_id, user_id into folder_workspace_id, folder_user_id
  from public.credential_folders
  where id = new.folder_id;

  if folder_workspace_id is null or folder_workspace_id <> new.workspace_id then
    raise exception 'folder must belong to the same workspace as the credential';
  end if;

  if folder_user_id <> new.user_id then
    raise exception 'folder must belong to the same member as the credential';
  end if;

  return new;
end;
$$;


-- ===========================================================================================
-- 5. vault_reset_requests + reset_vault: per-user, not per-workspace-owner.
-- ===========================================================================================

-- The select/update policies are already `requested_by = auth.uid()`. Only the insert policy was
-- owner-scoped — any member with a vault of their own can now request a reset of it.
drop policy vault_reset_requests_insert_owner on public.vault_reset_requests;

create policy vault_reset_requests_insert_member on public.vault_reset_requests
  for insert to authenticated
  with check (
    requested_by = auth.uid()
    and public.has_workspace_access(workspace_id, array['owner', 'editor', 'viewer'])
  );

-- reset_vault now wipes only the CALLER's vault + their own credentials/folders in that
-- workspace, and deletes their workspace_vaults row (was: clear the workspaces vault columns).
-- Still invoker-rights — the caller's own RLS grants (credentials_delete_own,
-- credential_folders_delete_own, workspace_vaults_delete_self, vault_reset_requests_update_own)
-- scope every write correctly with no separate auth re-check.
create or replace function public.reset_vault(p_workspace_id uuid, p_token text)
returns void
language plpgsql
as $$
declare
  v_request record;
begin
  select * into v_request from public.vault_reset_requests
    where workspace_id = p_workspace_id
      and token = p_token
      and requested_by = auth.uid()
      and confirmed_at is null
      and expires_at > now();
  if not found then
    raise exception 'reset request not found, expired, or already used';
  end if;

  delete from public.credentials
    where workspace_id = p_workspace_id and user_id = auth.uid();
  delete from public.credential_folders
    where workspace_id = p_workspace_id and user_id = auth.uid();
  delete from public.workspace_vaults
    where workspace_id = p_workspace_id and user_id = auth.uid();

  update public.vault_reset_requests set confirmed_at = now() where id = v_request.id;
end;
$$;


-- ===========================================================================================
-- 6. Drop the dead legacy migration RPC.
-- ===========================================================================================

drop function public.migrate_vault_to_wrapped_key(uuid, text, text, text, text, uuid[], jsonb);


-- ===========================================================================================
-- 7. transfer_workspace_ownership: the vault no longer blocks a transfer.
--    Each member's vault is their own private vault keyed to their own passphrase — the outgoing
--    owner keeps theirs (their workspace_vaults row is untouched), the new owner has their own or
--    none. Nothing to re-wrap. Everything else about the function is unchanged.
-- ===========================================================================================

create or replace function public.transfer_workspace_ownership(
  p_workspace_id uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_workspaces int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = auth.uid()
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_new_owner_id = auth.uid() then
    raise exception 'you already own this workspace';
  end if;

  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = p_new_owner_id
  ) then
    raise exception 'that person is not a member of this workspace';
  end if;

  -- The per-account 50-workspace cap trigger is BEFORE INSERT only; re-check it here.
  select count(*) into v_recipient_workspaces
  from public.workspaces where owner_id = p_new_owner_id;
  if v_recipient_workspaces >= 50 then
    raise exception 'the new owner already owns the maximum number of workspaces';
  end if;

  update public.workspaces set owner_id = p_new_owner_id where id = p_workspace_id;
  update public.workspace_members set role = 'owner'
    where workspace_id = p_workspace_id and user_id = p_new_owner_id;
  update public.workspace_members set role = 'editor'
    where workspace_id = p_workspace_id and user_id = auth.uid();
end;
$$;

revoke all on function public.transfer_workspace_ownership(uuid, uuid) from public;
grant execute on function public.transfer_workspace_ownership(uuid, uuid) to authenticated;
