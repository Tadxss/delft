-- Drops workspaces.vault_verifier / vault_verifier_iv (added in 20260816074505_vault_verifier.sql),
-- deferred at the time the wrapped-key model shipped (20260822154426_vault_wrapped_key.sql) until
-- every known workspace had migrated off the legacy direct-key model. Confirmed via a query against
-- production (`select count(*) filter (where vault_salt is not null and vault_wrapped_key is null)
-- from workspaces`): 0 of 2 workspaces are still unmigrated, so this is now safe.
--
-- reset_vault (20260822160105_reset_vault_rpc.sql) references these two columns in its UPDATE — has
-- to be replaced here too, or the drop below breaks that function.
create or replace function public.reset_vault(p_workspace_id uuid, p_token text)
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
    vault_wrapped_key = null,
    vault_wrapped_key_iv = null,
    vault_recovery_wrapped_key = null,
    vault_recovery_wrapped_key_iv = null
    where id = p_workspace_id;

  update public.vault_reset_requests set confirmed_at = now() where id = v_request.id;
end;
$$;

alter table public.workspaces drop column vault_verifier;
alter table public.workspaces drop column vault_verifier_iv;
