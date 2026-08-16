-- Adds workspaces.vault_verifier / vault_verifier_iv: a small AES-GCM ciphertext+iv pair,
-- encrypted client-side with the vault key at setup time (or backfilled on first successful
-- unlock for vaults that predate this column), used purely to verify a typed passphrase is
-- correct even when the workspace has zero credentials yet to test-decrypt against instead.
-- Both nullable (existing vaults won't have one until backfilled) and plaintext-safe to store —
-- like secret_ciphertext on `credentials`, this is ciphertext the server can read but not decrypt.
-- No RLS/grant changes: these are just two more columns on `workspaces`, already covered by the
-- existing workspaces_update_owner policy (owner_id = auth.uid()) for both select and update.

alter table public.workspaces add column vault_verifier text;
alter table public.workspaces add column vault_verifier_iv text;
