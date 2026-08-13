-- Workspace deletion was never wired up — workspaces_update_owner exists but there's no delete
-- policy/grant at all yet. Owner-only, mirroring workspaces_update_owner's owner_id = auth.uid()
-- gate. `pages`/`credentials`/`canvases`/`workspace_members` all reference workspace_id with
-- `on delete cascade`, so deleting the workspace row cascades everything else for free — no
-- additional cleanup needed here.

create policy workspaces_delete_owner on public.workspaces
  for delete
  to authenticated
  using (owner_id = auth.uid());

grant delete on public.workspaces to authenticated;
