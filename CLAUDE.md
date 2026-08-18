# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## What this is

Delft — a personal, zero-cost records/notes/credentials/canvas workspace, shipping web-only for
now from a Turborepo monorepo shaped so a future mobile app is a low-friction addition rather than
a restructure. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the schema/RLS design and the
numbered Build Order (what shipped, why, and real bugs found along the way — that file, not this
one, is the source of truth for project status; update it when you ship something).

**Hard constraint, non-negotiable for every decision here**: zero cost. No paid API, paid npm
package, paid SaaS dependency, or Supabase/Vercel paid-tier feature. Only free/open-source
libraries, self-hosted within the Supabase + Vercel free tiers. Flag it explicitly before
implementing anything that would realistically require a paid service.

**Status**: every originally-planned feature has shipped — Pages, auth (password + Google),
Credentials Manager (with nested folders), Excalidraw Canvas, and a Notion-style hover-affordance
UI (icon-only header, hover-reveal sidebar), all covered by an e2e suite, live at
`https://delft.vercel.app` (auto-deploys on push to `master`). See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)'s **Next Up** section for current focus — the
[docs/BETA_READINESS.md](docs/BETA_READINESS.md) audit is now fully closed out (every finding
fixed or explicitly accepted, see that doc's own status line) — and the numbered Build Order for
how each feature shipped.

## Commands

Package manager is **pnpm** — install/run from the repo root, not inside an individual app.

```sh
pnpm install
pnpm dev                  # turbo run dev
pnpm build                # turbo run build
pnpm lint                 # turbo run lint
pnpm check-types          # turbo run check-types
pnpm format                # prettier --write across the repo
```

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
npx supabase start        # boots the local stack (Postgres, Auth, Storage, Mailpit, Studio)
npx supabase db reset     # reapplies all migrations from scratch (destructive to local data)
npx supabase gen types typescript --local > packages/types/src/database.ts
```

Linked (`supabase link`) to the hosted `delft` project — new migrations do **not** apply to it
automatically, they need an explicit `supabase db push` after being applied locally (see
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

`.github/workflows/ci.yml` runs on every push/PR to `main`/`develop`: a `checks` job
(`pnpm lint`, `pnpm check-types`, `pnpm build`) and an `e2e` job (boots a real local Supabase stack
via `supabase/setup-cli`, then runs the full `apps/web/e2e/` suite against it).

## Architecture

**Monorepo layout** (pnpm workspaces: `apps/*`, `packages/*`):

- `apps/web` — Next.js App Router. Routes in `apps/web/app/`. Uses `@delft/eslint-config` and
  `@delft/typescript-config` as devDependencies rather than local lint/tsconfig rules.
- `packages/eslint-config`, `packages/typescript-config` — shared presets consumed via
  `workspace:*`.
- `packages/types` — hand-written domain types (`src/domain.ts`, camelCase) plus generated
  Supabase DB types (`src/database.ts`, snake_case — regenerate per the Supabase section above).
- `packages/shared` — the Supabase client factory + storage-adapter interface (`src/supabase/`,
  built so a future native app just supplies its own adapter rather than needing an auth
  plumbing rewrite), and one TanStack Query hook per operation (`src/hooks/`).
- No `packages/ui` yet — deliberately deferred until a second app needs shared components.

**Schema/RLS/build history**: fully specified in `docs/ARCHITECTURE.md` — read that before
touching any Supabase-related code. Two load-bearing, easy-to-accidentally-undo details documented
there in depth: RLS policies must be scoped `to authenticated` explicitly (an unscoped policy that
subqueries a table `anon` has no grant on throws a hard permission error for anon requests instead
of just filtering to zero rows), and `workspaces_select_member`'s `owner_id = auth.uid()` branch is
required (not just a redundant shortcut) for workspace creation's `INSERT ... RETURNING` to work at
all, given the membership row is created by a same-statement `AFTER INSERT` trigger.
