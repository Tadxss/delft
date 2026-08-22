-- Confirms a last-resort vault reset (see 20260822160053_vault_reset_requests.sql): validates the
-- token belongs to the calling (now-authenticated-via-magic-link) user, hasn't expired, and hasn't
-- already been used, then deletes every credential and folder in the vault and clears all vault
-- columns back to a fresh, never-set-up state. Genuinely destructive and irreversible — the
-- confirm page's own copy says so plainly before this is ever called, not just this comment.
--
-- Invoker-rights, not `security definer` — relies on credentials_delete_member,
-- credential_folders_delete_member, and workspaces_update_owner (via vault_reset_requests_select_own
-- for the token lookup, and the workspace update below) all already scoping this correctly to the
-- requester; no separate auth re-implementation needed.
create function public.reset_vault(p_workspace_id uuid, p_token text)
returns void
language plpgsql
as $$
declare
  v_request record;
begin
  select * into v_request from public.vault_reset_requests
    where workspace_id = p_workspace_id
      and token = p_token
      and requested_by = auth.uid()
      and confirmed_at is null
      and expires_at > now();
  if not found then
    raise exception 'reset request not found, expired, or already used';
  end if;

  delete from public.credentials where workspace_id = p_workspace_id;
  delete from public.credential_folders where workspace_id = p_workspace_id;

  update public.workspaces set
    vault_salt = null,
    vault_verifier = null,
    vault_verifier_iv = null,
    vault_wrapped_key = null,
    vault_wrapped_key_iv = null,
    vault_recovery_wrapped_key = null,
    vault_recovery_wrapped_key_iv = null
    where id = p_workspace_id;

  update public.vault_reset_requests set confirmed_at = now() where id = v_request.id;
end;
$$;

grant execute on function public.reset_vault(uuid, text) to authenticated;
