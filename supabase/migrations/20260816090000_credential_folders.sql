-- Credentials Manager: nested folders. A `credential_folders` table (pure containers — name only,
-- no secrets of their own) plus a nullable `credentials.folder_id` FK. Deliberately asymmetric
-- cascade behavior, unlike pages.parent_id's uniform `on delete cascade`:
--   - credential_folders.parent_folder_id is `on delete cascade`: deleting a folder recursively
--     deletes empty sub-folder shells too — folders hold nothing valuable on their own.
--   - credentials.folder_id is `on delete set null`: deleting a folder must NEVER destroy the
--     encrypted credentials inside it (a lost password is often costly to recover — has to be
--     reset on the actual external site — a lost empty folder shell is not). Surviving credentials
--     reparent to root (folder_id = null) instead.
--
-- Reminder: RLS + grants for credential_folders are in the paired *_credential_folders_rls.sql
-- migration (auto_expose_new_tables is off in this project).

create table public.credential_folders (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  parent_folder_id  uuid references public.credential_folders(id) on delete cascade,
  name              text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.credentials add column folder_id uuid references public.credential_folders(id) on delete set null;

create index credential_folders_workspace_id_idx on public.credential_folders(workspace_id);
create index credential_folders_parent_folder_id_idx on public.credential_folders(parent_folder_id);
create index credentials_folder_id_idx on public.credentials(folder_id);

-- Same "never forget to bump updated_at" rationale as set_credentials_updated_at / set_pages_updated_at.
create function public.set_credential_folders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger credential_folders_set_updated_at
  before update on public.credential_folders
  for each row execute function public.set_credential_folders_updated_at();

-- Guards two integrity concerns pages.parent_id has never needed to guard, because nothing lets a
-- client retarget a page's parent_id to one of its own descendants today — but "move a folder" is
-- now an explicit UI feature here:
--   1. Cycle prevention: moving folder A to become a descendant of itself would corrupt the tree
--      (e.g. infinite loop in client-side tree-walking / recursive rendering).
--   2. Cross-workspace guard: a user who belongs to two workspaces could otherwise point a folder
--      in workspace X at a parent folder in workspace Y they also belong to — RLS alone wouldn't
--      catch this, since both rows independently satisfy the membership predicate.
create function public.check_credential_folder_parent()
returns trigger
language plpgsql
as $$
declare
  parent_workspace_id uuid;
begin
  if new.parent_folder_id is null then
    return new;
  end if;

  if new.parent_folder_id = new.id then
    raise exception 'a folder cannot be its own parent';
  end if;

  select workspace_id into parent_workspace_id
  from public.credential_folders
  where id = new.parent_folder_id;

  if parent_workspace_id is null then
    raise exception 'parent folder does not exist';
  end if;

  if parent_workspace_id <> new.workspace_id then
    raise exception 'parent folder must belong to the same workspace';
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

-- Also fires on workspace_id changes, not just parent_folder_id: without that, a two-workspace
-- member could reassign a folder's workspace_id directly, leaving it pointed at a parent folder in
-- a now-different workspace without ever touching parent_folder_id itself.
create trigger credential_folders_check_parent
  before insert or update of parent_folder_id, workspace_id on public.credential_folders
  for each row execute function public.check_credential_folder_parent();

-- Same cross-workspace guard for credentials.folder_id (a credential's folder must be in the same
-- workspace as the credential itself).
create function public.check_credential_folder_workspace()
returns trigger
language plpgsql
as $$
declare
  folder_workspace_id uuid;
begin
  if new.folder_id is null then
    return new;
  end if;

  select workspace_id into folder_workspace_id
  from public.credential_folders
  where id = new.folder_id;

  if folder_workspace_id is null or folder_workspace_id <> new.workspace_id then
    raise exception 'folder must belong to the same workspace as the credential';
  end if;

  return new;
end;
$$;

-- Also fires on workspace_id changes for the same reason as credential_folders_check_parent above.
create trigger credentials_check_folder_workspace
  before insert or update of folder_id, workspace_id on public.credentials
  for each row execute function public.check_credential_folder_workspace();
