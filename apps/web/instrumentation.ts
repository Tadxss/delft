import * as Sentry from "@sentry/nextjs";

// Next.js's built-in server-startup hook — runs once per runtime (Node.js and Edge each get their
// own module instantiation), which is why the actual Sentry.init() calls live in separate
// runtime-specific files rather than here directly.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Reports errors from Server Components/Route Handlers/Server Actions — the server-side
// equivalent of app/error.tsx's client-side Sentry.captureException call.
export const onRequestError = Sentry.captureRequestError;
