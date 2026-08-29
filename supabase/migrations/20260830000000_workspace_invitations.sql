-- Workspace invitations & multi-user roles.
--
-- CrowScribe was "one user per workspace", but `workspace_members` has existed since migration #1
-- as future-proofing and every content RLS policy already keys off membership. This migration
-- turns that on: a `role` domain of owner/editor/viewer, a `workspace_invitations` table, and the
-- RPCs that create/accept/manage memberships. See docs/ARCHITECTURE.md Build Order for the design.
--
-- Design invariants preserved from 20260812140010_rls.sql:
--   * Every non-anon policy is `to authenticated` explicitly (unscoped policies get evaluated for
--     anon too and throw a hard "permission denied for table workspace_members").
--   * `workspace_members` keeps its self-only SELECT policy and SELECT-only grant. Every write to
--     it goes through a SECURITY DEFINER function (the trigger, or `accept_workspace_invitation`
--     below) — a single auditable write path, never a direct client insert.
--   * A policy ON `workspace_members` must never subquery `workspace_members` (infinite recursion).
--     The `has_workspace_access()` helper below is SECURITY INVOKER and only ever called from
--     policies on OTHER tables, so its inner read goes through `workspace_members_select_self`
--     (which does not self-subquery) — no recursion.
--
-- Credentials stay OWNER-ONLY in a shared workspace: the vault's per-workspace encryption key
-- can't be handed to a new member without a separate crypto design, so `credentials` /
-- `credential_folders` RLS is tightened to `role = 'owner'` here.


-- ===========================================================================================
-- 1. workspace_members: role domain + created_at
-- ===========================================================================================

-- Every existing row is 'owner' (only handle_new_workspace() ever writes, always 'owner'), so the
-- new CHECK validates instantly. 'member' was never written anywhere.
alter table public.workspace_members
  drop constraint workspace_members_role_check;
alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'editor', 'viewer'));

alter table public.workspace_members
  add column created_at timestamptz not null default now();


-- ===========================================================================================
-- 2. has_workspace_access() — the one place the membership+role check is defined
-- ===========================================================================================

-- SECURITY INVOKER: the inner workspace_members read is itself RLS-checked and only ever matches
-- rows where user_id = auth.uid() (workspace_members_select_self). Called only from policies on
-- pages / canvases / credentials / credential_folders — never from a workspace_members policy —
-- so there is no self-reference and no recursion. STABLE + language sql so the planner can fold it.
create function public.has_workspace_access(p_workspace_id uuid, p_roles text[])
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = any(p_roles)
  );
$$;

revoke all on function public.has_workspace_access(uuid, text[]) from public;
grant execute on function public.has_workspace_access(uuid, text[]) to authenticated;


-- ===========================================================================================
-- 3. Content RLS rewrite for roles
--    pages / canvases  : select = any role; write = owner|editor
--    credentials / credential_folders : all four = owner only
--    (*_select_published_anon policies are left completely untouched.)
-- ===========================================================================================

drop policy pages_select_member on public.pages;
drop policy pages_insert_member on public.pages;
drop policy pages_update_member on public.pages;
drop policy pages_delete_member on public.pages;

create policy pages_select_member on public.pages
  for select to authenticated
  using (public.has_workspace_access(workspace_id, array['owner','editor','viewer']));
create policy pages_insert_member on public.pages
  for insert to authenticated
  with check (public.has_workspace_access(workspace_id, array['owner','editor']));
create policy pages_update_member on public.pages
  for update to authenticated
  using (public.has_workspace_access(workspace_id, array['owner','editor']))
  with check (public.has_workspace_access(workspace_id, array['owner','editor']));
create policy pages_delete_member on public.pages
  for delete to authenticated
  using (public.has_workspace_access(workspace_id, array['owner','editor']));

drop policy canvases_select_member on public.canvases;
drop policy canvases_insert_member on public.canvases;
drop policy canvases_update_member on public.canvases;
drop policy canvases_delete_member on public.canvases;

create policy canvases_select_member on public.canvases
  for select to authenticated
  using (public.has_workspace_access(workspace_id, array['owner','editor','viewer']));
create policy canvases_insert_member on public.canvases
  for insert to authenticated
  with check (public.has_workspace_access(workspace_id, array['owner','editor']));
create policy canvases_update_member on public.canvases
  for update to authenticated
  using (public.has_workspace_access(workspace_id, array['owner','editor']))
  with check (public.has_workspace_access(workspace_id, array['owner','editor']));
create policy canvases_delete_member on public.canvases
  for delete to authenticated
  using (public.has_workspace_access(workspace_id, array['owner','editor']));

drop policy credentials_select_member on public.credentials;
drop policy credentials_insert_member on public.credentials;
drop policy credentials_update_member on public.credentials;
drop policy credentials_delete_member on public.credentials;

create policy credentials_select_member on public.credentials
  for select to authenticated
  using (public.has_workspace_access(workspace_id, array['owner']));
create policy credentials_insert_member on public.credentials
  for insert to authenticated
  with check (public.has_workspace_access(workspace_id, array['owner']));
create policy credentials_update_member on public.credentials
  for update to authenticated
  using (public.has_workspace_access(workspace_id, array['owner']))
  with check (public.has_workspace_access(workspace_id, array['owner']));
create policy credentials_delete_member on public.credentials
  for delete to authenticated
  using (public.has_workspace_access(workspace_id, array['owner']));

drop policy credential_folders_select_member on public.credential_folders;
drop policy credential_folders_insert_member on public.credential_folders;
drop policy credential_folders_update_member on public.credential_folders;
drop policy credential_folders_delete_member on public.credential_folders;

create policy credential_folders_select_member on public.credential_folders
  for select to authenticated
  using (public.has_workspace_access(workspace_id, array['owner']));
create policy credential_folders_insert_member on public.credential_folders
  for insert to authenticated
  with check (public.has_workspace_access(workspace_id, array['owner']));
create policy credential_folders_update_member on public.credential_folders
  for update to authenticated
  using (public.has_workspace_access(workspace_id, array['owner']))
  with check (public.has_workspace_access(workspace_id, array['owner']));
create policy credential_folders_delete_member on public.credential_folders
  for delete to authenticated
  using (public.has_workspace_access(workspace_id, array['owner']));


-- ===========================================================================================
-- 4. Storage: tighten write policies to owner|editor (viewers are strictly read-only).
--    Keeps the `::text` folder-segment compare (robust against a malformed non-uuid path).
--    *_select_member policies are left as any-member.
-- ===========================================================================================

drop policy page_images_insert_member on storage.objects;
drop policy page_images_update_member on storage.objects;
drop policy page_images_delete_member on storage.objects;

create policy page_images_insert_member on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'page-images'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
        and wm.role = any(array['owner','editor'])
    )
  );
create policy page_images_update_member on storage.objects
  for update to authenticated
  using (
    bucket_id = 'page-images'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
        and wm.role = any(array['owner','editor'])
    )
  );
create policy page_images_delete_member on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'page-images'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
        and wm.role = any(array['owner','editor'])
    )
  );

drop policy workspace_logos_insert_member on storage.objects;
drop policy workspace_logos_update_member on storage.objects;
drop policy workspace_logos_delete_member on storage.objects;

create policy workspace_logos_insert_member on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workspace-logos'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
        and wm.role = any(array['owner','editor'])
    )
  );
create policy workspace_logos_update_member on storage.objects
  for update to authenticated
  using (
    bucket_id = 'workspace-logos'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
        and wm.role = any(array['owner','editor'])
    )
  );
create policy workspace_logos_delete_member on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'workspace-logos'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
        and wm.role = any(array['owner','editor'])
    )
  );


-- ===========================================================================================
-- 5. workspace_invitations
-- ===========================================================================================

create table public.workspace_invitations (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  invited_by       uuid not null references auth.users(id) on delete cascade default auth.uid(),

  -- Exactly one of these is set (CHECK below). The RPC lowercases both before insert.
  invited_email    text
    check (invited_email is null
           or (char_length(invited_email) <= 320 and invited_email = lower(invited_email))),
  invited_username text
    check (invited_username is null or invited_username ~ '^[a-z0-9_]{3,20}$'),
  -- Set by invite_to_workspace when the target already has an account (always for a @username
  -- invite). Lets the invitee-visibility + accept paths match on a stable id.
  invited_user_id  uuid references auth.users(id) on delete cascade,

  role             text not null check (role in ('editor','viewer')),   -- never 'owner' via invite
  token            text not null unique default encode(gen_random_bytes(32), 'hex'),
  status           text not null default 'pending'
                     check (status in ('pending','accepted','revoked','declined')),
  expires_at       timestamptz not null default (now() + interval '14 days'),
  created_at       timestamptz not null default now(),
  responded_at     timestamptz,

  constraint workspace_invitations_target_exactly_one
    check (num_nonnulls(invited_email, invited_username) = 1)
);

create index workspace_invitations_workspace_id_idx
  on public.workspace_invitations(workspace_id);
create index workspace_invitations_invited_user_id_idx
  on public.workspace_invitations(invited_user_id) where invited_user_id is not null;
create index workspace_invitations_invited_email_idx
  on public.workspace_invitations(invited_email) where invited_email is not null;

-- At most one *pending* invite per (workspace, target). Partial — terminal rows don't block a
-- later re-invite.
create unique index workspace_invitations_pending_email_uniq
  on public.workspace_invitations(workspace_id, invited_email)
  where status = 'pending' and invited_email is not null;
create unique index workspace_invitations_pending_username_uniq
  on public.workspace_invitations(workspace_id, invited_username)
  where status = 'pending' and invited_username is not null;

alter table public.workspace_invitations enable row level security;

-- No insert/update/delete policy or grant — every write is through a SECURITY DEFINER RPC below,
-- same as workspace_members. SELECT is granted with two narrow policies (defense-in-depth /
-- debuggability; the shipped hooks use RPCs because they need joins). Both subquery *other*
-- tables, so no recursion.
create policy workspace_invitations_select_owner on public.workspace_invitations
  for select to authenticated
  using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.owner_id = auth.uid())
  );

-- Deliberately NOT matching on the raw `auth.jwt() ->> 'email'` claim: with
-- config.toml `enable_confirmations = false`, a session's email claim can be an unconfirmed
-- address (someone hitting GoTrue's signup API directly with the public anon key), so trusting it
-- would let them see an invite addressed to an email they don't own. `invited_user_id` (stamped
-- by invite_to_workspace only for a *confirmed* account) and the username branch (a username only
-- exists on a real profile row) are both ownership-proven. A brand-new invitee whose account
-- didn't exist at invite time reaches their invite via the token (/invite/[token]) +
-- get_my_pending_invitations, which verify against auth.users.email_confirmed_at directly.
create policy workspace_invitations_select_invitee on public.workspace_invitations
  for select to authenticated
  using (
    status = 'pending'
    and (
      invited_user_id = auth.uid()
      or invited_username = (select p.username from public.profiles p where p.id = auth.uid())
    )
  );

grant select on public.workspace_invitations to authenticated;


-- ===========================================================================================
-- 6. RPCs
--    All SECURITY DEFINER (bypass RLS + grants, run as the function owner — same as
--    handle_new_workspace) EXCEPT where noted. Each does its own authorization check as the first
--    statement. search_path pinned. revoke-from-public + grant-to-authenticated at the end.
-- ===========================================================================================

-- 6.1 invite_to_workspace ------------------------------------------------------------------------
create function public.invite_to_workspace(
  p_workspace_id uuid,
  p_email        text,
  p_username     text,
  p_role         text
)
returns public.workspace_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := nullif(lower(trim(p_email)), '');
  v_username text := nullif(lower(trim(p_username)), '');
  v_target   uuid;
  v_row      public.workspace_invitations;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_role not in ('editor','viewer') then
    raise exception 'invalid role';
  end if;
  if num_nonnulls(v_email, v_username) <> 1 then
    raise exception 'provide exactly one of email or username';
  end if;

  if not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = auth.uid()
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_username is not null then
    select p.id into v_target from public.profiles p where p.username = v_username;
    if v_target is null then
      raise exception 'no user with that username';
    end if;
  else
    if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'that doesn''t look like a valid email address';
    end if;
    -- Only bind invited_user_id to an account whose email is confirmed — otherwise leave it null
    -- and let the invite match by email once the real owner signs in (see accept_workspace_invitation).
    select u.id into v_target from auth.users u
      where lower(u.email) = v_email and u.email_confirmed_at is not null;
  end if;

  if v_target is not null and (
       exists (select 1 from public.workspace_members wm
               where wm.workspace_id = p_workspace_id and wm.user_id = v_target)
    or exists (select 1 from public.workspaces w
               where w.id = p_workspace_id and w.owner_id = v_target)
  ) then
    raise exception 'that person is already a member of this workspace';
  end if;

  insert into public.workspace_invitations
    (workspace_id, invited_by, invited_email, invited_username, invited_user_id, role)
  values
    (p_workspace_id, auth.uid(), v_email, v_username, v_target, p_role)
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    raise exception 'an invitation is already pending for this person';
end;
$$;

-- 6.2 get_my_pending_invitations ---------------------------------------------------------------
create function public.get_my_pending_invitations()
returns table (
  id                 uuid,
  token              text,
  workspace_id       uuid,
  workspace_name     text,
  workspace_logo_url text,
  role               text,
  invited_by_name    text,
  expires_at         timestamptz,
  created_at         timestamptz
)
language sql
security definer
set search_path = public
as $$
  select i.id, i.token, i.workspace_id, w.name, w.logo_url, i.role,
         coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
                  p.username, 'Someone'),
         i.expires_at, i.created_at
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles p on p.id = i.invited_by
  where i.status = 'pending'
    and i.expires_at > now()
    and (
      i.invited_user_id = auth.uid()
      -- email match: only against the caller's own *confirmed* address in auth.users, never the
      -- raw jwt claim (which can be an unconfirmed address — see the select_invitee policy comment).
      or (i.invited_email is not null and exists (
            select 1 from auth.users u
            where u.id = auth.uid()
              and u.email_confirmed_at is not null
              and lower(u.email) = i.invited_email))
      or i.invited_username = (select username from public.profiles where id = auth.uid())
    )
  order by i.created_at desc;
$$;

-- 6.3 accept_workspace_invitation ------------------------------------------------------------
-- The ONLY new writer of workspace_members. `for update` lock + `on conflict do nothing` cover
-- the double-click / concurrent-accept race.
create function public.accept_workspace_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv         public.workspace_invitations;
  v_my_email    text;
  v_my_username text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- The caller's *confirmed* email only (null if unconfirmed) — never the raw jwt claim.
  select lower(u.email) into v_my_email from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null;
  select username into v_my_username from public.profiles where id = auth.uid();

  select * into v_inv from public.workspace_invitations where token = p_token for update;
  if not found then
    raise exception 'invitation not found';
  end if;

  if not (
       v_inv.invited_user_id = auth.uid()
    or (v_inv.invited_email is not null and v_my_email is not null
        and v_inv.invited_email = v_my_email)
    or (v_inv.invited_username is not null and v_inv.invited_username = v_my_username)
  ) then
    raise exception 'this invitation is not for you' using errcode = '42501';
  end if;

  -- Already a member (accepted twice, or added another way): succeed idempotently.
  if exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = v_inv.workspace_id and wm.user_id = auth.uid()
  ) then
    update public.workspace_invitations
      set status = 'accepted', responded_at = coalesce(responded_at, now())
      where id = v_inv.id and status = 'pending';
    return v_inv.workspace_id;
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'this invitation is no longer valid';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'this invitation has expired';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_inv.workspace_id, auth.uid(), v_inv.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invitations
    set status = 'accepted', responded_at = now()
    where id = v_inv.id;

  return v_inv.workspace_id;
end;
$$;

-- 6.4 decline_workspace_invitation ------------------------------------------------------------
create function public.decline_workspace_invitation(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv         public.workspace_invitations;
  v_my_email    text;
  v_my_username text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select lower(u.email) into v_my_email from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null;
  select username into v_my_username from public.profiles where id = auth.uid();

  select * into v_inv from public.workspace_invitations where token = p_token for update;
  if not found then
    raise exception 'invitation not found';
  end if;

  if not (
       v_inv.invited_user_id = auth.uid()
    or (v_inv.invited_email is not null and v_my_email is not null
        and v_inv.invited_email = v_my_email)
    or (v_inv.invited_username is not null and v_inv.invited_username = v_my_username)
  ) then
    raise exception 'this invitation is not for you' using errcode = '42501';
  end if;

  update public.workspace_invitations
    set status = 'declined', responded_at = now()
    where id = v_inv.id and status = 'pending';
end;
$$;

-- 6.5 revoke_workspace_invitation ------------------------------------------------------------
create function public.revoke_workspace_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workspace_invitations i
    set status = 'revoked', responded_at = now()
    where i.id = p_invitation_id
      and i.status = 'pending'
      and exists (select 1 from public.workspaces w
                  where w.id = i.workspace_id and w.owner_id = auth.uid());
  if not found then
    raise exception 'not authorized, or that invitation is no longer pending'
      using errcode = '42501';
  end if;
end;
$$;

-- 6.6 get_workspace_members ----------------------------------------------------------------------
create function public.get_workspace_members(p_workspace_id uuid)
returns table (
  user_id      uuid,
  role         text,
  username     text,
  display_name text,
  email        text,
  avatar_url   text,
  joined_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_is_owner boolean;
begin
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select (w.owner_id = auth.uid()) into v_is_owner
    from public.workspaces w where w.id = p_workspace_id;

  return query
  select wm.user_id, wm.role, p.username,
         coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username),
         case when v_is_owner then u.email::text else null end,
         p.avatar_url, wm.created_at
  from public.workspace_members wm
  left join public.profiles p on p.id = wm.user_id
  left join auth.users u on u.id = wm.user_id
  where wm.workspace_id = p_workspace_id
  order by (wm.role = 'owner') desc, wm.created_at asc;
end;
$$;

-- 6.7 get_workspace_invitations ----------------------------------------------------------------
create function public.get_workspace_invitations(p_workspace_id uuid)
returns table (
  id               uuid,
  invited_email    text,
  invited_username text,
  role             text,
  status           text,
  token            text,
  expires_at       timestamptz,
  created_at       timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = auth.uid()
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select i.id, i.invited_email, i.invited_username, i.role, i.status,
         i.token, i.expires_at, i.created_at
  from public.workspace_invitations i
  where i.workspace_id = p_workspace_id and i.status = 'pending'
  order by i.created_at desc;
end;
$$;

-- 6.8 set_workspace_member_role --------------------------------------------------------------
create function public.set_workspace_member_role(
  p_workspace_id uuid,
  p_user_id      uuid,
  p_role         text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role not in ('editor','viewer') then
    raise exception 'invalid role';
  end if;
  if not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = auth.uid()
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = p_user_id
  ) then
    raise exception 'cannot change the owner''s role';
  end if;

  update public.workspace_members
    set role = p_role
    where workspace_id = p_workspace_id and user_id = p_user_id;
  if not found then
    raise exception 'that person is not a member of this workspace';
  end if;
end;
$$;

-- 6.9 remove_workspace_member --------------------------------------------------------------------
create function public.remove_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = auth.uid()
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = p_user_id
  ) then
    raise exception 'cannot remove the workspace owner';
  end if;

  delete from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_user_id;
  if not found then
    raise exception 'that person is not a member of this workspace';
  end if;
end;
$$;

-- 6.10 leave_workspace --------------------------------------------------------------------------
create function public.leave_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = auth.uid()
  ) then
    raise exception 'the owner cannot leave their own workspace';
  end if;
  delete from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid();
  if not found then
    raise exception 'you are not a member of this workspace';
  end if;
end;
$$;

-- 6.11 get_invitation_preview -----------------------------------------------------------------
-- anon + authenticated: the /invite/[token] screen loads before the user is a member (so RLS
-- can't help), for ANY token state (so the UI can render expired/revoked/accepted). Token-guarded,
-- non-sensitive display fields only, rate-limited via the existing rpc_rate_limits table under its
-- own key so it never interferes with get_email_for_username's bucket.
create function public.get_invitation_preview(p_token text)
returns table (
  workspace_name     text,
  workspace_logo_url text,
  inviter_name       text,
  role               text,
  status             text,
  expires_at         timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_seconds constant int := 60;
  v_max_calls      constant int := 60;
  v_count int;
begin
  insert into public.rpc_rate_limits (key, window_start, count)
  values ('get_invitation_preview', now(), 1)
  on conflict (key) do update
    set count = case
          when public.rpc_rate_limits.window_start < now() - make_interval(secs => v_window_seconds)
            then 1
          else public.rpc_rate_limits.count + 1
        end,
        window_start = case
          when public.rpc_rate_limits.window_start < now() - make_interval(secs => v_window_seconds)
            then now()
          else public.rpc_rate_limits.window_start
        end
  returning count into v_count;
  if v_count > v_max_calls then
    return;
  end if;

  return query
  select w.name, w.logo_url,
         coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
                  p.username, 'Someone'),
         i.role, i.status, i.expires_at
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles p on p.id = i.invited_by
  where i.token = p_token;
end;
$$;


-- Grants ------------------------------------------------------------------------------------------
revoke all on function public.invite_to_workspace(uuid, text, text, text) from public;
grant execute on function public.invite_to_workspace(uuid, text, text, text) to authenticated;

revoke all on function public.get_my_pending_invitations() from public;
grant execute on function public.get_my_pending_invitations() to authenticated;

revoke all on function public.accept_workspace_invitation(text) from public;
grant execute on function public.accept_workspace_invitation(text) to authenticated;

revoke all on function public.decline_workspace_invitation(text) from public;
grant execute on function public.decline_workspace_invitation(text) to authenticated;

revoke all on function public.revoke_workspace_invitation(uuid) from public;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;

revoke all on function public.get_workspace_members(uuid) from public;
grant execute on function public.get_workspace_members(uuid) to authenticated;

revoke all on function public.get_workspace_invitations(uuid) from public;
grant execute on function public.get_workspace_invitations(uuid) to authenticated;

revoke all on function public.set_workspace_member_role(uuid, uuid, text) from public;
grant execute on function public.set_workspace_member_role(uuid, uuid, text) to authenticated;

revoke all on function public.remove_workspace_member(uuid, uuid) from public;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

revoke all on function public.leave_workspace(uuid) from public;
grant execute on function public.leave_workspace(uuid) to authenticated;

revoke all on function public.get_invitation_preview(text) from public;
grant execute on function public.get_invitation_preview(text) to anon, authenticated;
