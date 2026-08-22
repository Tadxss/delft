-- Moves the Credentials Manager vault from "the passphrase-derived key directly encrypts every
-- credential" to a wrapped-master-key model: a random per-workspace Vault Master Key (VMK)
-- directly encrypts/decrypts credentials going forward, and the VMK itself is wrapped (AES-GCM
-- encrypted) under two independent factors — the existing passphrase-derived key, and a new
-- one-time-shown recovery key. Either factor alone can unwrap the VMK, which is what makes a
-- "forgot passphrase" flow possible without losing data (previously impossible: there was no
-- shared secret two independent unlock paths could both open). See vaultCrypto.ts's
-- wrapVaultMasterKey/unwrapVaultMasterKey and docs/ARCHITECTURE.md's Build Order for the full
-- design.
--
-- vault_verifier/vault_verifier_iv (20260816074505_vault_verifier.sql) are NOT dropped here —
-- they're still required for every pre-existing ("legacy") vault's old unlock path, which is the
-- prerequisite step before that vault can run the one-time migration to this new model. Drop them
-- in a follow-up migration once every known workspace has vault_wrapped_key set.
--
-- No RLS/grant changes needed — same reasoning as vault_verifier's own migration: these are just
-- more columns on `workspaces`, already covered by workspaces_update_owner for both select and
-- update.

alter table public.workspaces add column vault_wrapped_key text;
alter table public.workspaces add column vault_wrapped_key_iv text;
alter table public.workspaces add column vault_recovery_wrapped_key text;
alter table public.workspaces add column vault_recovery_wrapped_key_iv text;
