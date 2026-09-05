import * as Sentry from "@sentry/nextjs";

// Client-side init — current App Router convention (Next.js auto-loads this file by name/location,
// no manual import needed). Basic error capture only: no tracesSampleRate beyond 0 (no performance
// monitoring), no replay integrations (no session replay) — keeps this well within the free tier's
// event quota, matching sentry.server.config.ts/sentry.edge.config.ts's same scope.
// Loud tell if a production build ships without the DSN — Sentry.init() silently no-ops when it's
// missing, so an unset Vercel env var would leave prod error reporting dark with no other signal.
if (
  process.env.NODE_ENV === "production" &&
  !process.env.NEXT_PUBLIC_SENTRY_DSN
) {
  console.warn(
    "[sentry] NEXT_PUBLIC_SENTRY_DSN is not set — error reporting is disabled in this build",
  );
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  // Generic WebKit/Safari messages for an aborted fetch() — backgrounded tab, LAN drop, page
  // navigating away mid-request. Global-handler-caught (auto.browser.global_handlers.onerror),
  // a single minified frame, never actionable app-code noise. First seen from a real-device
  // iOS Safari test session pointed at a local dev server (NEXT_PUBLIC_SENTRY_DSN in
  // .env.local uses the same prod Sentry project, so local traffic reports there too).
  ignoreErrors: [
    "Load failed",
    "Failed to fetch",
    "NetworkError when attempting to fetch resource",
  ],
});

// Required export for Sentry to instrument App Router navigations — effectively a no-op here
// since tracesSampleRate is 0 (no performance monitoring), but its absence otherwise logs an
// "action required" warning on every build.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
