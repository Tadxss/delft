-- Free-tier abuse caps (production-readiness Milestone B, item 6).
--
-- Signup is open and workspaces are multi-user now, so `docs/BETA_READINESS.md`'s "the only
-- attacker with valid credentials is you" no longer holds. One authenticated account could fill
-- the shared 500 MB Postgres / 1 GB Storage by scripting inserts against `pages` / `canvases` /
-- `credentials` (all plain RLS `.insert()`, no RPC in the path) or by pushing multi-MB
-- `content` / `scene` blobs through autosave — nothing capped either dimension.
--
-- This migration bounds BOTH dimensions:
--   * per-row size CHECKs on the two unbounded jsonb columns
--   * per-scope row-count caps via BEFORE INSERT triggers (same shape as check_page_parent)
-- With a row-count cap AND a per-row size cap, the total bytes one account can create is
-- bounded regardless of write rate — which is why the permanently-"accepted" lack of
-- application-level mutation rate limiting stops mattering for the free-tier-fill threat.
--
-- Limits are deliberately generous (real single-workspace use is nowhere near them); they exist
-- to stop scripted abuse, not to shape normal usage. Bump them here if a legitimate workspace
-- ever gets close.

-- ── per-row content size ───────────────────────────────────────────────────────
-- octet_length(x::text) = the byte size of the canonical JSON the client sends. A large
-- BlockNote document is tens–low-hundreds of KB; an Excalidraw scene with hundreds of elements
-- can be several hundred KB (per-point arrays, bindings), so it gets a higher ceiling.
alter table public.pages
  add constraint pages_content_size check (octet_length(content::text) <= 2000000);
alter table public.canvases
  add constraint canvases_scene_size check (octet_length(scene::text) <= 8000000);

-- ── per-scope row-count caps ───────────────────────────────────────────────────
-- Two guards (kept separate so NEW field access is never conditional — a plpgsql CASE over
-- new.owner_id / new.workspace_id fails to compile on whichever table lacks one of them).
-- security invoker is fine: in every wired case the inserting user can already SELECT every
-- sibling row in that scope (workspace members see all pages/canvases; owners see their own
-- workspaces and all their credentials), so count(*) is accurate under RLS.

-- workspace-scoped: tg_argv[0] = limit. Dynamic because it fronts four tables.
create or replace function public.enforce_workspace_row_cap()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_limit int := tg_argv[0]::int;
  v_count int;
begin
  execute format('select count(*) from public.%I where workspace_id = $1', tg_table_name)
    into v_count using new.workspace_id;
  if v_count >= v_limit then
    raise exception 'limit reached: at most % % per workspace', v_limit, tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- per-owner workspace count.
create or replace function public.enforce_owner_workspace_cap()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_limit constant int := 50;
  v_count int;
begin
  select count(*) into v_count from public.workspaces where owner_id = new.owner_id;
  if v_count >= v_limit then
    raise exception 'limit reached: at most % workspaces per account', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger workspaces_enforce_cap
  before insert on public.workspaces
  for each row execute function public.enforce_owner_workspace_cap();

create trigger pages_enforce_cap
  before insert on public.pages
  for each row execute function public.enforce_workspace_row_cap('2000');

create trigger canvases_enforce_cap
  before insert on public.canvases
  for each row execute function public.enforce_workspace_row_cap('500');

create trigger credentials_enforce_cap
  before insert on public.credentials
  for each row execute function public.enforce_workspace_row_cap('2000');

create trigger credential_folders_enforce_cap
  before insert on public.credential_folders
  for each row execute function public.enforce_workspace_row_cap('500');
