-- Adds a `type` column to public.credentials so the Credentials Manager form/list can vary its
-- fields by credential shape (login w/ username+password, OAuth/SSO w/ no password, API key,
-- PIN) instead of one hardcoded username+password+notes form for everything. Plaintext (not part
-- of the encrypted secret_ciphertext blob) since the list view needs it for a per-row icon and a
-- type filter without decrypting every row. No RLS/grant changes needed — existing policies/grants
-- on credentials already cover every column of the row.
alter table public.credentials add column type text not null default 'login';

alter table public.credentials add constraint credentials_type_check
  check (type in ('login', 'oauth', 'api_key', 'pin'));
