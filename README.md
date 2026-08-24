# CrowScribe

A private, intelligent workspace for notes and ideas — where ideas take flight. Built on Next.js +
Supabase + Vercel free tiers, isolated per-workspace via RLS.

## What's inside

- `apps/web` — [Next.js](https://nextjs.org/) (App Router), Tailwind CSS, [BlockNote](https://www.blocknotejs.org/) editor
- `packages/eslint-config` — shared `eslint` configuration
- `packages/typescript-config` — shared `tsconfig.json`s
- `packages/types` — domain types + generated Supabase DB types
- `packages/shared` — Supabase client, TanStack Query hooks
- `supabase/` — Postgres schema, RLS policies, and Storage config

Package manager is **pnpm** — install from the repo root with `pnpm install`.

**Status**: every originally-planned feature has shipped — Pages (recursive page tree, BlockNote
editor with autosave, image upload with client-side compression, publish/share to a public
read-only `/share/[slug]` route), auth (password + Google), a Credentials Manager (encrypted
vault, nested folders), an Excalidraw-style Canvas, a user profile (name/occupation/bio/avatar),
and a Notion-style dark/light UI (hover-affordance sidebar, icon-only header,
`/workspace/{slug}--{id}` URLs). Live at `https://crowscribe.vercel.app` (`https://delft.vercel.app`
still works too, kept as a legacy alias), auto-deploying on push to `master`. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)'s numbered Build Order for how each shipped, and its
"Next Up" section for current focus.

Everything here runs on free tiers by design — Supabase Storage in particular caps out at 1GB, so
image uploads are compressed/resized client-side (1920px max, WebP, EXIF stripped) before they ever
leave the browser. Revisit those compression settings against real usage once a few pages have
images.

## Develop

```sh
pnpm install
npx supabase start        # local stack (requires Docker Desktop)
pnpm dev                  # runs the web app's dev server via turbo
```

Copy `apps/web/.env.local.example` → `apps/web/.env.local`, filling in the anon key from
`supabase start`'s output (the URL is already the local default, `http://127.0.0.1:54321`).

## Build / Lint / Typecheck

```sh
pnpm build
pnpm lint
pnpm check-types
```

## Tests

```sh
pnpm --filter web test:e2e       # requires local Supabase running + `pnpm dev`
pnpm --filter web test:e2e:ui    # interactive mode, for debugging a single spec
```

See [docs/TESTING.md](docs/TESTING.md) for what each spec covers, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the numbered Build Order (what shipped, why, and
two real RLS/autosave bugs the e2e suite caught that manual testing missed).

## Supabase

```sh
npx supabase start        # local stack (requires Docker Desktop)
npx supabase db reset     # reapply all migrations from scratch (destructive to local data)
npx supabase gen types typescript --local > packages/types/src/database.ts
```

This repo is linked (`supabase link`) to a hosted project, live at `https://crowscribe.vercel.app`
(`https://delft.vercel.app` still works too) — see
`docs/ARCHITECTURE.md` Build Order step 18 for the deployment setup and what's still manual (git
auto-deploy, hosted auth URL/Google provider config). `npx supabase db push` applies local
migrations to the hosted database. See `packages/types/src/database.ts`'s header comment for the
type-regeneration command, and `supabase/migrations/` for the schema and its RLS/grants reasoning.

## Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use [Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching) to
share cache artifacts across machines and CI. Authenticate with `turbo login`, then link this repo
with `turbo link`.
