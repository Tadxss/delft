-- Adds CHECK-constraint length limits to free-text columns that had none, matching the pattern
-- already used by workspaces.name (init.sql) and profiles.username (profile_username.sql). No new
-- table, so no companion GRANT needed here.
--
-- Deliberately real DB-level constraints, not just client-side maxLength: the client can be
-- bypassed entirely (this app has no server other than Supabase itself), so the only trustworthy
-- enforcement boundary is Postgres. `credentials.username`/`password`/`notes` are NOT covered
-- here — they're client-side AES-GCM ciphertext bundled into `secret_ciphertext`, so the server
-- never sees that plaintext and there's nothing meaningful to length-check.
--
-- Separate `alter table` statements per column (not one combined check per table) so a single
-- unexpectedly-long existing value blocks only its own constraint, not every column on that table.

alter table public.pages
  add constraint pages_title_length check (char_length(title) <= 500);

alter table public.credentials
  add constraint credentials_title_length check (char_length(title) <= 200),
  add constraint credentials_url_length check (url is null or char_length(url) <= 2000);

alter table public.credential_folders
  add constraint credential_folders_name_length check (char_length(name) <= 200);

alter table public.canvases
  add constraint canvases_title_length check (char_length(title) <= 200);

alter table public.profiles
  add constraint profiles_first_name_length check (first_name is null or char_length(first_name) <= 100),
  add constraint profiles_middle_name_length check (middle_name is null or char_length(middle_name) <= 100),
  add constraint profiles_last_name_length check (last_name is null or char_length(last_name) <= 100),
  add constraint profiles_occupation_length check (occupation is null or char_length(occupation) <= 200),
  add constraint profiles_bio_length check (bio is null or char_length(bio) <= 2000);
