-- RLS policies. Naming convention: <table>_<action>_<qualifier>.
--
-- `workspace_members` deliberately gets a SELF-ONLY select policy, not a "fellow member can see
-- the whole roster" policy — a policy on `workspace_members` that subqueries `workspace_members`
-- itself (e.g. "workspace_id in (select workspace_id from workspace_members where user_id =
-- auth.uid())") is a well-known Postgres RLS footgun: it recurses into its own policy evaluation
-- and Postgres errors with "infinite recursion detected in policy for relation
-- workspace_members". `workspaces`/`pages` policies below subquery `workspace_members` too, but
-- that's safe — they're a *different* table, so there's no self-reference.

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.pages enable row level security;

-- Every non-public policy below is scoped `to authenticated` explicitly. Without that, a
-- permissive policy applies to PUBLIC (every role, including anon) by default, and Postgres must
-- evaluate ALL applicable permissive policies for a query — including ones that subquery
-- workspace_members — even when the role turns out not to match. Since anon has no GRANT on
-- workspace_members (by design), evaluating an unscoped member-check policy for an anon request
-- throws a hard "permission denied for table workspace_members" instead of just filtering to zero
-- rows. Scoping `to authenticated` means Postgres skips these policies entirely for anon requests.

-- workspaces: readable by any member (owner included, since the trigger enrolls them as one) OR
-- the owner directly. The `owner_id = auth.uid()` branch isn't just a redundant shortcut: it's
-- required for `INSERT ... RETURNING` (what PostgREST/supabase-js's `.insert().select()` always
-- issues) to work at all. Postgres evaluates a SELECT policy for RETURNING against the
-- statement's original snapshot, which does NOT see writes made by an AFTER trigger within that
-- same statement — so immediately after creating a workspace, the EXISTS-against-workspace_members
-- branch alone can't yet see the handle_new_workspace() trigger's own membership row, and the
-- insert fails with "new row violates row-level security policy" even though the row and its
-- membership both land correctly. Checking owner_id directly needs no such row-visibility timing
-- and sidesteps the whole issue. (Real bug found and fixed via a failing e2e test — see
-- docs/ARCHITECTURE.md Build Order.)
create policy workspaces_select_member on public.workspaces
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspaces.id and wm.user_id = auth.uid()
    )
  );

create policy workspaces_insert_own on public.workspaces
  for insert
  to authenticated
  with check (owner_id = auth.uid());

-- Rename-only in practice (nothing else on this row changes via the client) — still owner-gated,
-- not member-gated, since ownership transfer/deletion-adjacent actions shouldn't be a plain member
-- capability once real sharing exists.
create policy workspaces_update_owner on public.workspaces
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- workspace_members: see only your own membership row (which workspace(s) you belong to, and
-- your role in each). No INSERT/UPDATE/DELETE policy at all — the only writer is the
-- SECURITY DEFINER handle_new_workspace() trigger from the init migration, which runs as the
-- function owner and therefore bypasses RLS and grants entirely. This keeps "how does a
-- membership row get created" a single, auditable code path instead of also being reachable via a
-- direct client insert.
create policy workspace_members_select_self on public.workspace_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- pages: every action gated on workspace membership. No separate owner-vs-member distinction for
-- pages themselves — anyone who can see the workspace can fully manage its pages, matching the
-- plan's "single private place" model (real per-page permissions aren't in scope for v1).
create policy pages_select_member on public.pages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pages.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy pages_insert_member on public.pages
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pages.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy pages_update_member on public.pages
  for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pages.workspace_id and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pages.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy pages_delete_member on public.pages
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = pages.workspace_id and wm.user_id = auth.uid()
    )
  );

-- The one deliberate hole in an otherwise fully private schema: an anonymous (logged-out) reader
-- may select a page ONLY when it is published, with no workspace-membership check at all — that's
-- the entire point of the /share/[slug] route. Scoped strictly to `is_published = true`; an
-- unpublished page (even one with a `published_slug` left over from a previous publish/unpublish
-- cycle) must never match this policy.
create policy pages_select_published_anon on public.pages
  for select
  to anon
  using (is_published = true);
