import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // @delft/shared and @delft/types are raw TS source (no build step) — Next needs to transpile
  // them itself rather than treating them as pre-built node_modules.
  transpilePackages: ["@delft/shared", "@delft/types"],
  // Next.js 16 blocks dev-resource (HMR websocket, etc.) requests from any origin not in this
  // list, and treats "127.0.0.1" as a DIFFERENT origin from "localhost" even on the same machine.
  // Local Supabase's default redirect_to/site_url is 127.0.0.1-based (see supabase/config.toml),
  // so visiting the app via 127.0.0.1 is the normal flow here — without this, every dev-resource
  // request from that origin (including the HMR websocket) is silently blocked, which breaks the
  // Turbopack client bootstrap badly enough that the page never finishes hydrating (event handlers
  // like the sign-in form's onSubmit never attach, so clicking "Send magic link" falls through to
  // a native HTML form submit instead of calling the React handler).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Security headers, applied to every route. `frame-ancestors 'none'`/X-Frame-Options: DENY is
  // safe here — nothing in the app ever renders inside an iframe (Google sign-in is a popup, not
  // an embed; confirmed no <iframe> usage anywhere in apps/web). HSTS is meaningful even though
  // Vercel already forces HTTPS at the edge: it tells the browser to *never* attempt plain HTTP
  // for this origin again (closing the window for a downgrade/strip attack on the very first
  // request), which Vercel's redirect-after-the-fact alone doesn't cover.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

// No org/project/authToken — those are only needed for source-map upload, which is out of scope
// here (Sentry's UI shows minified stack traces instead, still actionable via error type/message/
// breadcrumbs). This wrapper still adds Sentry's request-tracing instrumentation without it.
export default withSentryConfig(nextConfig, {
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true } },
});
