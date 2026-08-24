-- Core schema for CrowScribe (see C:\Users\Daryl\.claude\plans\check-votero-tech-stack-linear-aurora.md).
--
-- Every table below is workspace-scoped. `workspace_members` exists even though v1 is
-- single-user-per-workspace so every RLS policy can key off membership rather than `owner_id`
-- directly — extending to real multi-user sharing later needs zero schema change, just new rows.

create table public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner', 'member')),
  primary key (workspace_id, user_id)
);

create table public.pages (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  parent_id       uuid references public.pages(id) on delete cascade,
  title           text not null default '',
  content         jsonb not null default '[]'::jsonb,
  is_published    boolean not null default false,
  published_slug  text unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index workspace_members_user_id_idx on public.workspace_members(user_id);
create index pages_workspace_id_idx on public.pages(workspace_id);
create index pages_parent_id_idx on public.pages(parent_id);

-- Keeps `updated_at` honest on every edit (title/content/publish toggle) without relying on every
-- call site to remember to set it — the autosave path in particular updates `content` very
-- frequently and must not skip this.
create function public.set_pages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function public.set_pages_updated_at();

-- Auto-enrolls the creating user as `owner` of their own new workspace. Done as a SECURITY
-- DEFINER trigger (not left to the client, and not a plain RPC) so `workspace_members` can have
-- zero direct INSERT grant to `authenticated` at all — the only way a membership row is ever
-- created is this trigger, which is the simplest possible invariant to reason about later once
-- real invites/sharing are added.
create function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger workspaces_set_owner_member
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace();
