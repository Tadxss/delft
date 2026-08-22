-- One-time, all-or-nothing migration of a single legacy vault (vault_salt set, vault_wrapped_key
-- not yet set) to the wrapped-master-key model: re-encrypts every existing credential's secret
-- under a new client-generated Vault Master Key (VMK) and persists the workspace's wrapped-key
-- columns, in one transaction. Called by VaultMigrationPanel.tsx once a legacy vault's passphrase
-- has already been verified client-side (the old direct-key decrypt/re-encrypt happens in the
-- browser; this function only ever receives ciphertext).
--
-- Deliberately invoker-rights, not `security definer` — this only needs to do what the calling
-- user's own RLS grants already allow (credentials_update_member, workspaces_update_owner), so
-- running as invoker enforces both of those for free instead of re-implementing the auth checks.
--
-- All-or-nothing by construction: this whole body is one transaction, so any `raise exception`
-- below (ownership check, or the credential set having changed since the client fetched it) rolls
-- back every write made so far, including the credential re-encryptions already applied in this
-- call. A retry after a failure is always safe, because vault_wrapped_key stays null — nothing is
-- ever "half migrated" from the app's point of view.
create function public.migrate_vault_to_wrapped_key(
  p_workspace_id uuid,
  p_wrapped_key text,
  p_wrapped_key_iv text,
  p_recovery_wrapped_key text,
  p_recovery_wrapped_key_iv text,
  p_credential_ids uuid[],
  p_credentials jsonb -- [{id, secret_ciphertext, secret_iv}, ...]
) returns void
language plpgsql
as $$
declare
  v_updated_count int;
  v_credential_row record;
begin
  -- Concurrency guard: if a credential was added/removed (another tab, another device) between the
  -- client's fetch and this call, abort rather than silently leaving that credential encrypted
  -- under the old direct key forever — once vault_wrapped_key is set, the app never derives the
  -- old key again, so a credential missed here would become permanently unreachable.
  if (
    select count(*) from public.credentials
    where workspace_id = p_workspace_id and id = any(p_credential_ids)
  ) <> coalesce(array_length(p_credential_ids, 1), 0) then
    raise exception 'credential set changed during migration, retry';
  end if;

  for v_credential_row in
    select * from jsonb_to_recordset(p_credentials)
      as x(id uuid, secret_ciphertext text, secret_iv text)
  loop
    update public.credentials
      set secret_ciphertext = v_credential_row.secret_ciphertext,
          secret_iv = v_credential_row.secret_iv
      where id = v_credential_row.id and workspace_id = p_workspace_id;
  end loop;

  update public.workspaces
    set vault_wrapped_key = p_wrapped_key,
        vault_wrapped_key_iv = p_wrapped_key_iv,
        vault_recovery_wrapped_key = p_recovery_wrapped_key,
        vault_recovery_wrapped_key_iv = p_recovery_wrapped_key_iv
    where id = p_workspace_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count = 0 then
    -- RLS makes an UPDATE a non-error, zero-row no-op rather than a permission error — this is the
    -- ownership guard: a non-owner member can update `credentials` (member policy) but not
    -- `workspaces` (owner-only policy). Without this explicit check, a member running this
    -- migration would silently re-encrypt every credential under a VMK that's never actually
    -- persisted anywhere, permanently orphaning that data. Raising here rolls back the credential
    -- updates above too, since this whole function body is one transaction.
    raise exception 'only the workspace owner can complete this vault upgrade';
  end if;
end;
$$;

grant execute on function public.migrate_vault_to_wrapped_key(uuid, text, text, text, text, uuid[], jsonb) to authenticated;
