-- Optional free-text description for a workspace, editable in Workspace settings. Nullable, with
-- the same 2000-char CHECK cap as profiles.bio (20260818000010_text_length_limits.sql) — the
-- client's maxLength can be bypassed, so Postgres is the real boundary.
--
-- No RLS/grant changes — just another column on `workspaces`, already covered by
-- workspaces_update_owner for select + update and the existing
-- `grant select, insert, update on public.workspaces to authenticated` (same as logo_url).

alter table public.workspaces
  add column description text
  check (description is null or char_length(description) <= 2000);
