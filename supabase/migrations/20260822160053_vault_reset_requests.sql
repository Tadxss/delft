-- Tracks a last-resort vault reset request: reachable only when BOTH the passphrase and the
-- recovery key are lost (Part 3 of the vault recovery feature — see
-- ForgotPassphrasePanel.tsx's "Lost your recovery key too?" link). Requesting a reset creates a
-- row here with a random token; confirming it (reset_vault RPC, next migration) requires that
-- token AND a live authenticated session, which is what clicking the emailed magic link
-- (re-)establishes — see apps/web/app/workspace/[workspaceSlug]/vault-reset/page.tsx.
--
-- Owner-only: this is the single most destructive action in the app (wipes every credential in
-- the vault), so deliberately not a plain-member capability even though credentials themselves are
-- member-writable.
create table public.vault_reset_requests (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  -- Defaults to the calling user rather than requiring the client to pass it explicitly — the
  -- insert policy's with_check already requires requested_by = auth.uid(), so this just means the
  -- client never has to (and can't accidentally get wrong by) supply its own id.
  requested_by  uuid not null references auth.users(id) default auth.uid(),
  token         text not null unique,
  expires_at    timestamptz not null default (now() + interval '1 hour'),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.vault_reset_requests enable row level security;

create policy vault_reset_requests_insert_owner on public.vault_reset_requests
  for insert
  to authenticated
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  );

create policy vault_reset_requests_select_own on public.vault_reset_requests
  for select
  to authenticated
  using (requested_by = auth.uid());

-- The reset_vault RPC (next migration) is invoker-rights, not security definer — it runs as the
-- calling user's own `authenticated` role, so it needs a real grant to mark a request confirmed,
-- not just "this happens inside a function". Scoped to the requester's own rows only, same as
-- select — nothing else about a reset (which credentials get deleted, which vault columns get
-- cleared) is controlled through this table or this grant; that all still goes through the RPC.
create policy vault_reset_requests_update_own on public.vault_reset_requests
  for update
  to authenticated
  using (requested_by = auth.uid())
  with check (requested_by = auth.uid());

grant select, insert, update on public.vault_reset_requests to authenticated;
