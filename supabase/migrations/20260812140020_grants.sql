-- Explicit table-level GRANTs for the Data API roles.
--
-- This project's `auto_expose_new_tables` is off (the current Supabase default — see the comment
-- on that key in supabase/config.toml): a table created in `public` is NOT automatically reachable
-- by `anon`/`authenticated` just because it has RLS policies. A GRANT is the base privilege; RLS
-- policies then filter which *rows* a granted role can see/touch. Without the GRANTs below, every
-- query against these tables fails with "permission denied for table X" before RLS is even
-- evaluated — this is the exact gotcha that bit the sibling project (votero) once, so it's being
-- done right from migration #1 here.

-- workspaces: full CRUD for authenticated (RLS above narrows to member/owner rows). No anon grant
-- at all — a workspace itself is never part of the public share surface, only individual
-- published pages are.
grant select, insert, update on public.workspaces to authenticated;

-- workspace_members: SELECT only, so workspace_members_select_self is actually reachable by
-- clients. No INSERT/UPDATE/DELETE grant for any role — see the RLS migration's comment: the only
-- writer is the SECURITY DEFINER handle_new_workspace() trigger, which runs as the function owner
-- and doesn't need (or want) a client-facing grant.
grant select on public.workspace_members to authenticated;

-- pages: full CRUD for authenticated (RLS above narrows to workspace members). `anon` gets SELECT
-- only, scoped entirely by pages_select_published_anon — this is the one deliberately-public read
-- path in the schema, and it must never be paired with an anon grant on workspaces or
-- workspace_members (there isn't one, by omission above).
grant select, insert, update, delete on public.pages to authenticated;
grant select on public.pages to anon;
