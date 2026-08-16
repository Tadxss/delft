-- Resolves a username to its account's email, callable by a signed-out (anon) client — the sign-in
-- page needs this BEFORE the user is authenticated, since Supabase Auth's signInWithPassword only
-- ever accepts an email (or phone), never a username. This is the first anon-callable RPC in this
-- repo (every other security definer function so far is a trigger, not a client-callable RPC).
--
-- Deliberate tradeoff, confirmed with the user before building this: anyone who knows or guesses a
-- username can resolve it to the account's email through this function. Kept as narrow as
-- possible to limit that surface — returns a bare email-or-null, never a row/record, and never
-- distinguishes "username doesn't exist" from any other non-match case.
create function public.get_email_for_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select u.email into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = lower(p_username);
  return v_email;
end;
$$;

revoke all on function public.get_email_for_username(text) from public;
grant execute on function public.get_email_for_username(text) to anon, authenticated;
