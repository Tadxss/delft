-- Flat lookup for the send-invitation-email Edge Function (see supabase/functions/). It runs with
-- the service-role key, so this is really just a convenience join — PostgREST can't traverse
-- workspace_invitations.invited_by → public.profiles (the FK points at auth.users), and the
-- function needs `invited_email`, which get_invitation_preview deliberately omits.
--
-- Granted to service_role ONLY: nothing client-facing should resolve a token to an email address.

create function public.get_invitation_for_email(p_token text)
returns table (
  invited_email  text,
  status         text,
  invited_by     uuid,
  role           text,
  expires_at     timestamptz,
  workspace_name text,
  workspace_owner_id uuid,
  inviter_name   text
)
language sql
security definer
set search_path = public
as $$
  select i.invited_email, i.status, i.invited_by, i.role, i.expires_at,
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
