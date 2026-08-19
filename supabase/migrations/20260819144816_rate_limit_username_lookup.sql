-- Rate-limits public.get_email_for_username (supabase/migrations/20260817000010_username_lookup_rpc.sql),
-- the first anon-callable RPC in this repo. That migration's own comment already accepts that
-- anyone who knows/guesses a username can resolve it to an email — this adds a cheap global
-- throttle on top so that acceptance doesn't also mean unlimited-rate enumeration once there's a
-- real population of usernames worth scripting through (a single trusted user has nothing to
-- enumerate; beta testers do).
--
-- Deliberately a single global bucket (not per-IP/per-caller — anon RPC calls carry no caller
-- identity to key on) rather than no limit at all: caps enumeration throughput without touching
-- the legitimate sign-in path, where a real user looks up their own username once.
create table public.rpc_rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);

-- Not exposed via PostgREST at all (no grant to anon/authenticated) — only touched from inside
-- the security definer function below, so no RLS policy is needed either.
revoke all on public.rpc_rate_limits from anon, authenticated;

create or replace function public.get_email_for_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_window_seconds constant int := 60;
  v_max_calls constant int := 20;
  v_count int;
begin
  insert into public.rpc_rate_limits (key, window_start, count)
  values ('get_email_for_username', now(), 1)
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

  -- Same externally-visible result as "username not found" — doesn't leak that throttling
  -- occurred, matching the original function's "never distinguishes non-match cases" comment.
  if v_count > v_max_calls then
    return null;
  end if;

  select u.email into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = lower(p_username);
  return v_email;
end;
$$;

revoke all on function public.get_email_for_username(text) from public;
grant execute on function public.get_email_for_username(text) to anon, authenticated;
