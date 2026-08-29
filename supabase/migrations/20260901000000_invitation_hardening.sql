-- Hardening from the post-step-79/80 security re-audit (see docs/BETA_READINESS.md's
-- "Post-step-37: multi-user surface" section):
--   * cap unbounded invite creation (Resend-quota exhaustion + auth.users pollution via the
--     Edge Function's `type: "invite"` fallback) — a per-workspace pending-invite ceiling plus a
--     modest global rate bucket, matching the get_email_for_username throttle pattern;
--   * `workspace_invitations.last_emailed_at` + `mark_invitation_emailed()` so the Edge Function
--     can 60s-throttle re-sends of the same invite;
--   * `get_invitation_for_email` → SECURITY INVOKER (only service_role can call it and service_role
--     already bypasses RLS — elevated mode isn't needed), and it now also returns last_emailed_at.


alter table public.workspace_invitations
  add column last_emailed_at timestamptz;


-- Stamp after a successful Resend send. service_role only (the Edge Function).
create function public.mark_invitation_emailed(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.workspace_invitations
    set last_emailed_at = now()
    where token = p_token;
$$;

revoke all on function public.mark_invitation_emailed(text) from public;
grant execute on function public.mark_invitation_emailed(text) to service_role;


-- get_invitation_for_email: invoker rights + last_emailed_at column.
drop function public.get_invitation_for_email(text);
create function public.get_invitation_for_email(p_token text)
returns table (
  invited_email      text,
  status             text,
  invited_by         uuid,
  role               text,
  expires_at         timestamptz,
  last_emailed_at    timestamptz,
  workspace_name     text,
  workspace_owner_id uuid,
  inviter_name       text
)
language sql
security invoker
set search_path = public
as $$
  select i.invited_email, i.status, i.invited_by, i.role, i.expires_at, i.last_emailed_at,
         w.name, w.owner_id,
         coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
                  p.username, 'Someone')
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles p on p.id = i.invited_by
  where i.token = p_token;
$$;

revoke all on function public.get_invitation_for_email(text) from public;
grant execute on function public.get_invitation_for_email(text) to service_role;


-- invite_to_workspace: + a per-workspace pending-invite cap and a global rate bucket.
create or replace function public.invite_to_workspace(
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
  v_pending  int;
  v_window_seconds constant int := 60;
  v_max_calls      constant int := 30;
  v_count int;
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

  -- Global throughput ceiling (same crude single-bucket shape as get_email_for_username — invites
  -- are infrequent, and this only needs to stop a script, not schedule fair access).
  insert into public.rpc_rate_limits (key, window_start, count)
  values ('invite_to_workspace', now(), 1)
  on conflict (key) do update
    set count = case
          when public.rpc_rate_limits.window_start < now() - make_interval(secs => v_window_seconds)
            then 1 else public.rpc_rate_limits.count + 1 end,
        window_start = case
          when public.rpc_rate_limits.window_start < now() - make_interval(secs => v_window_seconds)
            then now() else public.rpc_rate_limits.window_start end
  returning count into v_count;
  if v_count > v_max_calls then
    raise exception 'too many invitations right now — try again in a minute';
  end if;

  -- Per-workspace ceiling on outstanding invites.
  select count(*) into v_pending
  from public.workspace_invitations
  where workspace_id = p_workspace_id and status = 'pending';
  if v_pending >= 100 then
    raise exception 'this workspace has too many pending invitations — revoke some first';
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

  -- If the target resolved to a real user, don't let the same person be pending twice (once by
  -- email, once by username / user id).
  if v_target is not null and exists (
    select 1 from public.workspace_invitations i
    where i.workspace_id = p_workspace_id and i.status = 'pending'
      and (i.invited_user_id = v_target
           or (i.invited_email is not null and i.invited_email = (
                 select lower(u.email) from auth.users u where u.id = v_target)))
  ) then
    raise exception 'an invitation is already pending for this person';
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
