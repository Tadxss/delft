import * as Sentry from "@sentry/nextjs";

// Basic error capture only — no performance tracing, no session replay (client-only feature
// anyway) — to stay comfortably within Sentry's free-tier event quota.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  // Report only from real production. `apps/web/.env.local` (gitignored, real local config) has
  // the production DSN filled in, so without this gate every `pnpm dev` session — and every
  // `next start` / Vercel preview build — reports straight into the prod project. Set
  // NEXT_PUBLIC_SENTRY_FORCE_ENABLE=1 to opt a local session back in when testing Sentry itself.
  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE === "1",
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
