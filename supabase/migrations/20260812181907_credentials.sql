-- Credentials Manager: per-workspace encrypted credential vault.
-- Adds workspaces.vault_salt (per-workspace PBKDF2 salt, plaintext — salts aren't secret) and the
-- `credentials` table (title/url plaintext for the list view; username/password/notes bundled into
-- one AES-GCM ciphertext+iv pair per row, encrypted/decrypted entirely client-side — the server
-- only ever stores/returns ciphertext, never a key or plaintext secret).
--
-- Reminder: a new table needs an explicit GRANT in a companion migration in addition to RLS
-- policies — auto_expose_new_tables is off, so RLS alone does not expose a table via PostgREST.
-- RLS policies + grants for `credentials` are in the paired *_credentials_rls.sql migration.

alter table public.workspaces add column vault_salt text;

create table public.credentials (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  title              text not null default '',
  url                text,
  secret_ciphertext  text not null,
  secret_iv          text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index credentials_workspace_id_idx on public.credentials(workspace_id);

-- Same "never forget to bump updated_at" rationale as set_pages_updated_at.
create function public.set_credentials_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger credentials_set_updated_at
  before update on public.credentials
  for each row execute function public.set_credentials_updated_at();
