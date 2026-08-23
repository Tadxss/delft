import * as Sentry from "@sentry/nextjs";

// Basic error capture only — no performance tracing, no session replay (client-only feature
// anyway) — to stay comfortably within Sentry's free-tier event quota.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});
