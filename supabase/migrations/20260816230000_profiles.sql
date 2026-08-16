-- `profiles` table: per-user (not workspace-scoped) fields for the Account modal's "Update
-- profile" box — name, occupation, bio, avatar. `id` doubles as both PK and FK to `auth.users`
-- (one profile per user, not a separate surrogate key) — mirrors how every other 1:1-with-auth
-- relationship in Supabase projects is modeled.
--
-- `occupation` is plain text, not an enum: the client renders a curated dropdown (see
-- apps/web/app/_lib/occupations.ts) with a trailing "Other" option that reveals a free-text input
-- whose value is saved directly into this same column — no separate "occupation_other" column,
-- and no schema change needed if the curated list changes later.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  first_name  text,
  middle_name text,
  last_name   text,
  occupation  text,
  bio         text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Same pattern as pages_set_updated_at.
create function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();

-- Auto-creates a blank profile row for every new user, mirroring handle_new_workspace's
-- AFTER INSERT SECURITY DEFINER pattern (init.sql) — except this trigger lives on `auth.users`,
-- not a `public` table. Existing accounts (created before this migration) won't get a row from
-- this trigger; the client's save path uses `upsert` (not plain `update`) so a pre-existing
-- user's first save self-heals without a manual backfill.
create function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();
