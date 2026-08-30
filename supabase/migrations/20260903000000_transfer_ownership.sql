-- Workspace ownership transfer (production-readiness Milestone C / item 12).
--
-- `owner_id` is the authorization source of truth for every owner-gated RPC and policy, and a
-- client `UPDATE workspaces SET owner_id = ...` is blocked by `workspaces_update_owner`'s
-- `WITH CHECK (owner_id = auth.uid())` — so transfer has to be a SECURITY DEFINER RPC, like the
-- other membership operations. It also has to fix up `workspace_members` by hand:
-- `handle_new_workspace()` only sets the initial `role='owner'` row on INSERT, and
-- `set_workspace_member_role` / `remove_workspace_member` / `leave_workspace` all refuse to touch
-- an owner row.
--
-- **The vault does not transfer.** The vault master key is wrapped only under the *original
-- owner's* passphrase-derived key and one-time recovery key — neither is transferable and there
-- is no re-wrap-for-another-user primitive (per-member vault-key sharing is a separate, unbuilt
-- crypto design). A new owner would get RLS access to the ciphertext but couldn't decrypt it, so
-- transfer is refused while a vault exists; the outgoing owner exports it and resets it first.

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
  v_has_vault boolean;
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

  select vault_wrapped_key is not null into v_has_vault
  from public.workspaces where id = p_workspace_id;
  if v_has_vault then
    raise exception
      'this workspace has a credentials vault, which is encrypted with your passphrase and cannot be transferred — export it (Account settings) and reset the vault first';
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
