-- Excalidraw Canvas: standalone per-workspace canvases (own table, own sidebar presence, not
-- embedded in Pages). `scene` holds only Excalidraw's {elements, appState} — never the third
-- `files` argument from its onChange callback, so no rendered image/binary data is ever stored
-- server-side (the image-insertion tool is hidden client-side to match, see CanvasEditor.tsx).
--
-- Reminder: a new table needs an explicit GRANT in a companion migration in addition to RLS
-- policies — auto_expose_new_tables is off. RLS + grants are in the paired *_canvases_rls.sql.

create table public.canvases (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title        text not null default '',
  scene        jsonb not null default '{"elements":[],"appState":{}}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index canvases_workspace_id_idx on public.canvases(workspace_id);

-- Same "never forget to bump updated_at" rationale as set_pages_updated_at.
create function public.set_canvases_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger canvases_set_updated_at
  before update on public.canvases
  for each row execute function public.set_canvases_updated_at();
