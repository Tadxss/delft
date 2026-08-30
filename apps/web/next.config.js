import { withSentryConfig } from "@sentry/nextjs";

// Content-Security-Policy, shipped **report-only** first (Build Order step 86 / Milestone B) —
// it logs violations to the browser console without blocking anything, so real usage across the
// editor / canvas / vault / share pages can be observed and the allowlist tuned before flipping
// to an enforcing `Content-Security-Policy` header in a follow-up.
//
//   script-src 'unsafe-inline'  — Next 16 App Router injects inline bootstrap scripts and there
//     is no nonce infrastructure (no middleware.ts). Dropping 'unsafe-inline' via a nonce is a
//     Milestone C item. Even with it, this still blocks the main vault-exfil vector: an injected
//     external `<script src>` and `fetch()`/`connect` to an attacker host.
//   style-src 'unsafe-inline'   — unavoidable: BlockNote / Mantine / Excalidraw set style attrs.
//   img-src ... https:          — users paste arbitrary external image URLs (workspace logo,
//     avatar, BlockNote image blocks), so this can't be tightly scoped; http: and non-image
//     schemes are still blocked.
//   worker-src blob:            — Excalidraw's font-subsetting worker.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseHost = new URL(supabaseUrl).host;
const httpProto = supabaseUrl.startsWith("https") ? "https" : "http";
const wsProto = httpProto === "https" ? "wss" : "ws";
// `next dev` (Turbopack HMR) evaluates strings as JS; a production build does not (verified:
// zero violations against `next start`). So 'unsafe-eval' is dev-only.
const devEval =
  process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${devEval} https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  // Excalidraw 0.18 loads its hand-drawn fonts from esm.sh at runtime (its default
  // EXCALIDRAW_ASSET_PATH) — self-hosting them (Milestone C) would drop this.
  "font-src 'self' https://esm.sh",
  `connect-src 'self' ${httpProto}://${supabaseHost} ${wsProto}://${supabaseHost} https://esm.sh https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://vitals.vercel-insights.com`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // @crowscribe/shared and @crowscribe/types are raw TS source (no build step) — Next needs to transpile
  // them itself rather than treating them as pre-built node_modules.
  transpilePackages: ["@crowscribe/shared", "@crowscribe/types"],
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
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
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
