# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## What this is

CrowScribe — a zero-cost records/notes/credentials/canvas workspace, shipping web-only for now
from a Turborepo monorepo shaped so a future mobile app is a low-friction addition rather than a
restructure. It started single-user; workspaces can now be shared by role (see Build Order step
79). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the schema/RLS design and the numbered
Build Order (what shipped, why, and real bugs found along the way — that file, not this one, is
the source of truth for project status; update it when you ship something).

**Hard constraint, non-negotiable for every decision here**: zero cost. No paid API, paid npm
package, paid SaaS dependency, or Supabase/Vercel paid-tier feature. Only free/open-source
libraries, self-hosted within the Supabase + Vercel free tiers. Flag it explicitly before
implementing anything that would realistically require a paid service.

**Status**: the originally-planned single-user set shipped (Pages, auth, Credentials Manager with
nested folders, Excalidraw Canvas, Notion-style hover-affordance UI), and the app has since grown
a mandatory first-login onboarding stepper, page + canvas publishing (`/share/[slug]`,
`/share/canvas/[slug]`), user profiles, and **multi-user workspaces** — invite by email or
`@username`, owner/editor/viewer roles, best-effort invitation emails through the repo's first
Supabase Edge Function (`supabase/functions/send-invitation-email/`). All covered by an e2e suite.
Live at `https://crowscribe.space` (a Namecheap domain on Vercel nameservers, auto-tracking every
`master` deploy — the old `crowscribe.vercel.app` / `delft.vercel.app` URLs are no longer
maintained). Auto-deploys on push to `master`. Build Order steps 78–81 shipped via PR #44 — merged, migrations
pushed to hosted, Edge Function deployed (inert without `RESEND_API_KEY`). Still pending: the
`crowscribe.space` DNS cutover (step 82) and Resend setup (see ARCHITECTURE.md "Next Up"). See ARCHITECTURE.md's
**Next Up** for current focus and the Build Order for how each feature shipped;
[docs/BETA_READINESS.md](docs/BETA_READINESS.md)'s original audit is closed out as of Build Order
step 37, with a separate section for the multi-user surface added since.

## Commands

Package manager is **pnpm** — install/run from the repo root, not inside an individual app.

```sh
pnpm install
pnpm dev                  # turbo run dev
pnpm build                # turbo run build
pnpm lint                 # turbo run lint
pnpm check-types          # turbo run check-types
```

`pnpm format` (`prettier --write`) exists but **don't run it casually** — the committed code was
never prettier-clean, so it reformats 100+ unrelated files. CI never runs `prettier --check`.
Edit with the surrounding style; use targeted `Edit`s, not a blanket format.

```sh
cd apps/web && pnpm dev   # Next.js dev server on :3000
```

`apps/web` has a Playwright e2e suite (`apps/web/e2e/`) — see
[docs/TESTING.md](docs/TESTING.md) for what each spec covers and local prerequisites:

```sh
cd apps/web && pnpm test:e2e     # headless — requires local Supabase running + the dev server
cd apps/web && pnpm test:e2e:ui  # interactive UI mode, for debugging a single spec
```

### Supabase

Requires Docker running. From repo root:

```sh
npx supabase start        # boots the local stack (Postgres, Auth, Storage, Mailpit, Studio, Edge runtime)
npx supabase db reset     # reapplies all migrations from scratch (destructive to local data)
npx supabase gen types typescript --local > packages/types/src/database.ts
```

Edge Functions live in `supabase/functions/` (currently just `send-invitation-email`, the invite
email). `supabase start` serves them; iterate a single one with
`supabase functions serve send-invitation-email --env-file supabase/functions/.env`. Local
secrets: `supabase/functions/.env` (gitignored; copy from `.env.example`; the function no-ops
when `RESEND_API_KEY` is blank — the default for local/CI). **Gotcha**: that `.env` is reloaded
on `supabase stop && supabase start`, **not** on `supabase db reset`. Hosted:
`supabase functions deploy send-invitation-email` + `supabase secrets set RESEND_API_KEY=… RESEND_FROM=… SITE_URL=…`.

Linked (`supabase link`) to the hosted project (its ref is still `delft`; display name renamed to
crowscribe) — new migrations do **not** apply to it automatically, they need an explicit
`supabase db push` after being applied locally (see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) Build Order step 18's "recurring gotcha" note; a
migration silently missing on hosted doesn't error, writes just no-op). `apps/web/.env.local`
(gitignored, copy from `.env.local.example`) points at the local stack (`http://127.0.0.1:54321`)
by default — local dev always targets local Supabase, never the hosted project directly.

**Windows/Turbopack dev-origin gotcha**: `apps/web/next.config.js` sets
`allowedDevOrigins: ["127.0.0.1", "localhost"]`. Without it, Next.js 16 silently blocks dev-resource
requests (including the HMR WebSocket) from `127.0.0.1` — which is the origin local Supabase's
`site_url`/magic-link `redirect_to` uses by default — badly enough that the page never finishes
hydrating and clicks silently fall through to native form submits. See
`docs/ARCHITECTURE.md` Build Order step 4 if this regresses.

### CI

`.github/workflows/ci.yml` runs on every push/PR to `master`/`develop`: a `checks` job
(`pnpm lint`, `pnpm check-types`, `pnpm build`) and an `e2e` job (boots a real local Supabase
stack via `supabase/setup-cli`, then runs the full `apps/web/e2e/` suite against it — that stack
now also serves the Edge Function, which no-ops without `RESEND_API_KEY`, so `functions.invoke`
from the invitation spec is harmless).

## Architecture

**Monorepo layout** (pnpm workspaces: `apps/*`, `packages/*`):

- `apps/web` — Next.js App Router. Routes in `apps/web/app/`. Uses `@crowscribe/eslint-config` and
  `@crowscribe/typescript-config` as devDependencies rather than local lint/tsconfig rules.
- `packages/eslint-config`, `packages/typescript-config` — shared presets consumed via
  `workspace:*`.
- `packages/types` — hand-written domain types (`src/domain.ts`, camelCase) plus generated
  Supabase DB types (`src/database.ts`, snake_case — regenerate per the Supabase section above).
- `packages/shared` — the Supabase client factory + storage-adapter interface (`src/supabase/`,
  built so a future native app just supplies its own adapter rather than needing an auth
  plumbing rewrite), and one TanStack Query hook per operation (`src/hooks/`) — CRUD hooks over
  tables plus wrappers over the SECURITY DEFINER RPCs (invitations, membership).
- `supabase/functions/` — Deno Edge Functions. Currently one: `send-invitation-email` (Build
  Order step 80), the **first server-side code** in the repo and the **first
  `SUPABASE_SERVICE_ROLE_KEY` use**. `verify_jwt = true`; it bypasses RLS as the service role and
  re-checks the caller is the inviter/owner in TS. Everything else in the app is still
  browser-client + anon key + RLS.
- No `packages/ui` yet — deliberately deferred until a second app needs shared components.

**Schema/RLS/build history**: fully specified in `docs/ARCHITECTURE.md` — read that before
touching any Supabase-related code. Load-bearing, easy-to-accidentally-undo details documented
there in depth:

1. RLS policies must be scoped `to authenticated` explicitly — an unscoped policy that subqueries
   a table `anon` has no grant on throws a hard permission error for anon requests instead of
   just filtering to zero rows.
2. `workspaces_select_member`'s `owner_id = auth.uid()` branch is required (not a redundant
   shortcut) for workspace creation's `INSERT ... RETURNING`, given the membership row is created
   by a same-statement `AFTER INSERT` trigger.
3. **Never subquery `workspace_members` from a policy _on_ `workspace_members`** (infinite
   recursion). It keeps a bare self-only SELECT policy; the role-aware `has_workspace_access()`
   helper the content policies call is `SECURITY INVOKER` and only ever called from policies on
   _other_ tables. Every `workspace_members` write goes through a `SECURITY DEFINER` function.
4. Credentials/`credential_folders` RLS is **owner-only** in a shared workspace — editors/viewers
   never see credential rows (the per-workspace vault key can't be shared).
5. `enable_confirmations = false` (magic-link-only signup) ⇒ a session's `auth.jwt() ->> 'email'`
   claim can be an _unconfirmed_ address. The invitation RPCs match invitees against
   `auth.users.email_confirmed_at`, never the raw claim.
