-- Manual sibling ordering, replacing the previous created_at/name/title derived sort, so drag-to-
-- reorder (not just drag-to-reparent, which already shipped) has something to write to. All four
-- tables get identical treatment: a `position double precision` column, backfilled to match each
-- table's *current* visible order exactly (so this migration causes zero visible reshuffling on
-- deploy), then left with a clock-based default for future inserts (new rows still just append
-- without any client code needing to compute a position itself).
--
-- double precision + client-computed midpoint-between-neighbors (see
-- packages/shared/src/lib/positionUtils.ts) is deliberately not integer-with-gaps or a
-- fractional-indexing library: reordering only ever needs a value strictly between two neighbors,
-- and IEEE 754 double precision has far more headroom (~15-17 significant digits) than this app's
-- realistic write volume (occasional personal drags, not thousands of competing writes into the
-- same gap) will ever exhaust. That exhaustion is a real, documented failure mode of this scheme —
-- just not one worth a renumbering safety net at this app's scale.

alter table public.pages add column position double precision;
alter table public.credential_folders add column position double precision;
alter table public.credentials add column position double precision;
alter table public.canvases add column position double precision;

-- Backfill BEFORE setting a clock_timestamp() default: Postgres evaluates a volatile default once
-- for the whole `alter table ... add column`, not per row, so doing this in the other order would
-- give every existing row under one parent the exact same value, destroying the very order this
-- backfill exists to preserve.
update public.pages p set position = sub.rn
from (
  select id, row_number() over (partition by parent_id order by created_at) as rn
  from public.pages
) sub
where p.id = sub.id;

update public.credential_folders f set position = sub.rn
from (
  select id, row_number() over (partition by parent_folder_id order by name) as rn
  from public.credential_folders
) sub
where f.id = sub.id;

update public.credentials c set position = sub.rn
from (
  select id, row_number() over (partition by folder_id order by title) as rn
  from public.credentials
) sub
where c.id = sub.id;

update public.canvases cv set position = sub.rn
from (
  select id, row_number() over (order by created_at) as rn
  from public.canvases
) sub
where cv.id = sub.id;

alter table public.pages alter column position set not null;
alter table public.pages alter column position set default extract(epoch from clock_timestamp());

alter table public.credential_folders alter column position set not null;
alter table public.credential_folders alter column position set default extract(epoch from clock_timestamp());

alter table public.credentials alter column position set not null;
alter table public.credentials alter column position set default extract(epoch from clock_timestamp());

alter table public.canvases alter column position set not null;
alter table public.canvases alter column position set default extract(epoch from clock_timestamp());

create index pages_parent_position_idx on public.pages(parent_id, position);
create index credential_folders_parent_position_idx on public.credential_folders(parent_folder_id, position);
create index credentials_folder_position_idx on public.credentials(folder_id, position);
create index canvases_position_idx on public.canvases(position);
