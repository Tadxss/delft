-- Adds an optional, unique username to profiles, so an account can later be signed into via
-- username instead of email (see the companion get_email_for_username RPC in the next migration).
--
-- Stored already-lowercased — the app normalizes input before it ever reaches this column, and
-- the CHECK constraint only accepts lowercase characters anyway — so a plain `unique` constraint
-- gives case-insensitive-in-practice matching with no need for `citext` or a functional
-- lower(username) index. Nullable: nothing forces an existing account to set one, and multiple
-- NULLs never collide under a standard unique constraint.
alter table public.profiles
  add column username text
    constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$'),
  add constraint profiles_username_unique unique (username);
