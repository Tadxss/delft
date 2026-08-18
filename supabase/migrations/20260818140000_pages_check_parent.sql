-- Guards pages.parent_id against the same integrity concerns credential_folders_check_parent
-- already guards for folders (see 20260816090000_credential_folders.sql) — until now nothing let a
-- client retarget a page's parent_id to one of its own descendants, so this trigger was never
-- needed. Page drag-and-drop reparenting (Pages sidebar) is exactly the scenario that migration's
-- own comment warned about, so this ports the identical pattern to pages.parent_id.
--   1. Cycle prevention: moving page A to become a descendant of itself would corrupt the tree
--      (e.g. infinite loop in client-side tree-walking / recursive rendering).
--   2. Cross-workspace guard: a user who belongs to two workspaces could otherwise point a page in
--      workspace X at a parent page in workspace Y they also belong to — RLS alone wouldn't catch
--      this, since both rows independently satisfy the membership predicate.
-- Unlike credential_folders_check_parent, this only needs to fire on parent_id changes, not
-- workspace_id: no client code path (useCreatePage/useUpdatePage/useDeletePage) ever changes a
-- page's workspace_id after creation.
create function public.check_page_parent()
returns trigger
language plpgsql
as $$
declare
  parent_workspace_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'a page cannot be its own parent';
  end if;

  select workspace_id into parent_workspace_id
  from public.pages
  where id = new.parent_id;

  if parent_workspace_id is null then
    raise exception 'parent page does not exist';
  end if;

  if parent_workspace_id <> new.workspace_id then
    raise exception 'parent page must belong to the same workspace';
  end if;

  if exists (
    with recursive descendants as (
      select id from public.pages where parent_id = new.id
      union all
      select p.id from public.pages p
      join descendants d on p.parent_id = d.id
    )
    select 1 from descendants where id = new.parent_id
  ) then
    raise exception 'cannot move a page into its own descendant';
  end if;

  return new;
end;
$$;

create trigger pages_check_parent
  before insert or update of parent_id on public.pages
  for each row execute function public.check_page_parent();
