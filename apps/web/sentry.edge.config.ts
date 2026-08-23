import * as Sentry from "@sentry/nextjs";

// Basic error capture only — same rationale as sentry.server.config.ts. Separate file/init because
// the Edge runtime is a distinct module instantiation from Node.js (see instrumentation.ts).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});
