# CrowScribe

An intelligent workspace for notes and ideas — where ideas take flight. Built on Next.js +
Supabase + Vercel free tiers; every workspace is RLS-isolated, and can be shared with others by
role (owner / editor / viewer).

## What's inside

- `apps/web` — [Next.js](https://nextjs.org/) (App Router), Tailwind CSS, [BlockNote](https://www.blocknotejs.org/) editor
- `packages/eslint-config` — shared `eslint` configuration
- `packages/typescript-config` — shared `tsconfig.json`s
- `packages/types` — domain types + generated Supabase DB types
- `packages/shared` — Supabase client, TanStack Query hooks
- `supabase/` — Postgres schema, RLS policies, Storage config, and Edge Functions

Package manager is **pnpm** — install from the repo root with `pnpm install`.

**Status**: Pages (recursive page tree, BlockNote editor with autosave, image upload with
client-side compression, publish/share to a public read-only `/share/[slug]` route), Canvas
(Excalidraw-style, also publishable at `/share/canvas/[slug]`), a Credentials Manager (encrypted
vault, nested folders), auth (password + Google), a mandatory first-login onboarding stepper, a
user profile (name/company/occupation/bio/avatar), **multi-user workspaces** (invite by email or
`@username`, owner/editor/viewer roles, best-effort invitation emails via a Supabase Edge
Function + Resend), and a Notion-style dark/light UI (hover-affordance sidebar,
`/workspace/{slug}--{id}` URLs). Live at `https://crowscribe.space`, auto-deploying on push to
`master`. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)'s numbered Build Order for how each shipped, and its
"Next Up" section for current focus (including a pending hosted-deploy backlog).

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

Optional free-tier services (both no-op when unconfigured): Sentry (`NEXT_PUBLIC_SENTRY_DSN` in
`apps/web/.env.local`) for error tracking, and **Resend** for workspace-invitation emails — copy
`supabase/functions/.env.example` → `supabase/functions/.env` and set `RESEND_API_KEY` (a
Resend key), `RESEND_FROM` (a Resend-verified sender address), and `SITE_URL` (the origin the
`/invite/[token]` accept link points at, `http://127.0.0.1:3000` locally). Leave `RESEND_API_KEY`
blank and the `send-invitation-email` function is inert (the default for local dev / CI).
`supabase start` picks the file up on a full restart; iterate the function itself with
`npx supabase functions serve send-invitation-email --env-file supabase/functions/.env`.

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

This repo is linked (`supabase link`) to a hosted project, live at `https://crowscribe.space` —
see `docs/ARCHITECTURE.md` Build Order steps 18 and 82 for the deployment setup and what's still
manual (hosted auth URL / Google provider config, Edge Function deploy + secrets). `npx supabase db push` applies local
migrations to the hosted database. See `packages/types/src/database.ts`'s header comment for the
type-regeneration command, and `supabase/migrations/` for the schema and its RLS/grants reasoning.

## Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use [Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching) to
share cache artifacts across machines and CI. Authenticate with `turbo login`, then link this repo
with `turbo link`.
