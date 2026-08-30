-- Belt-and-suspenders from the Milestone C profiles/avatars RLS audit (item 14). The audit came
-- back clean; this is the one low-severity follow-up: `rpc_rate_limits` has no client grant and
-- no policy (only SECURITY DEFINER functions ever touch it — get_email_for_username,
-- invite_to_workspace, get_invitation_preview), so it isn't exposed today. Enabling RLS means a
-- future accidental `grant ... to authenticated` can't expose it either — with RLS on and no
-- policy, non-owner roles see zero rows.
alter table public.rpc_rate_limits enable row level security;
