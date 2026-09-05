-- Duplicates a page and its whole descendant subtree in one atomic call (Build Order step 100).
-- SECURITY INVOKER, not DEFINER: pages_insert_member's RLS already lets any workspace member
-- create pages directly (see useCreatePage.ts) — this RPC exists only to make a multi-row copy
-- atomic and one round trip, not to bypass any policy. Must loop row-by-row (not one
-- INSERT ... SELECT): check_page_parent fires `before insert ... of parent_id` and looks up the
-- new parent row by id, which isn't visible to a sibling row inserted earlier in the SAME
-- statement (Postgres only advances the command counter between statements). A loop makes each
-- inserted row visible before the next one's trigger runs.
--
-- Never copies is_published/published_slug: published_slug has a UNIQUE constraint (copying it
-- verbatim is a hard insert failure), and copying is_published:true would make a private draft
-- immediately public at its old slug. Every duplicate is created unpublished, matching
-- useCreatePage's own defaults.
--
-- Storage images referenced inside `content` are NOT touched here — Storage has no SQL access.
-- The client (useDuplicatePage.ts) copies each new page's Storage objects and rewrites the
-- content JSON afterward, using the (old_id, new_id, content) rows this function returns.
create or replace function public.duplicate_page(
  p_source_id uuid,
  p_new_position double precision
)
returns table (
  old_id uuid,
  new_id uuid,
  is_root boolean,
  workspace_id uuid,
  content jsonb
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row record;
  v_new_id uuid;
  v_parent_new_id uuid;
  v_source_workspace_id uuid;
  v_source_parent_id uuid;
begin
  select p.workspace_id, p.parent_id into v_source_workspace_id, v_source_parent_id
  from public.pages p where p.id = p_source_id;

  if v_source_workspace_id is null then
    raise exception 'page not found';
  end if;

  create temporary table _page_dup_map (
    old_id uuid primary key,
    new_id uuid not null
  ) on commit drop;

  for v_row in
    with recursive descendants as (
      select p.id, p.parent_id, p.title, p.content, p.position, 0 as depth
      from public.pages p where p.id = p_source_id
      union all
      select p.id, p.parent_id, p.title, p.content, p.position, d.depth + 1
      from public.pages p
      join descendants d on p.parent_id = d.id
    )
    select * from descendants order by depth, position
  loop
    v_new_id := gen_random_uuid();

    if v_row.id = p_source_id then
      v_parent_new_id := v_source_parent_id; -- duplicate is a sibling of the original, not its child
    else
      select m.new_id into v_parent_new_id from _page_dup_map m where m.old_id = v_row.parent_id;
    end if;

    insert into public.pages (id, workspace_id, parent_id, title, content, position)
    values (
      v_new_id,
      v_source_workspace_id,
      v_parent_new_id,
      case when v_row.id = p_source_id then v_row.title || ' (copy)' else v_row.title end,
      v_row.content,
      case when v_row.id = p_source_id then p_new_position else v_row.position end
    );

    insert into _page_dup_map (old_id, new_id) values (v_row.id, v_new_id);

    old_id := v_row.id;
    new_id := v_new_id;
    is_root := (v_row.id = p_source_id);
    workspace_id := v_source_workspace_id;
    content := v_row.content;
    return next;
  end loop;
end;
$$;

revoke all on function public.duplicate_page(uuid, double precision) from public;
grant execute on function public.duplicate_page(uuid, double precision) to authenticated;
