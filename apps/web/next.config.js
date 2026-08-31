import { withSentryConfig } from "@sentry/nextjs";

// Content-Security-Policy — **enforcing** as of Build Order step 87 (ran report-only through
// Milestone B with zero violations across editor / canvas / vault / share, plus e2e coverage).
//
//   script-src 'unsafe-inline'  — Next 16 App Router injects inline bootstrap scripts and there
//     is no nonce infrastructure (no middleware.ts). Dropping 'unsafe-inline' via a nonce is a
//     later item. Even with it, this blocks the main vault-exfil vector: an injected external
//     `<script src>` and `fetch()`/`connect` to an attacker host.
//   script-src 'unsafe-eval'    — dev only (`next dev` Turbopack HMR evals strings; a prod build
//     does not).
//   style-src 'unsafe-inline'   — unavoidable: BlockNote / Mantine / Excalidraw set style attrs.
//   img-src ... https:          — users paste arbitrary external image URLs (workspace logo,
//     avatar, BlockNote image blocks), so this can't be tightly scoped; http: and non-image
//     schemes are still blocked.
//   worker-src blob:            — Excalidraw's font-subsetting worker.
//   font-src / connect-src https://esm.sh — Excalidraw 0.18 loads its hand-drawn fonts from
//     esm.sh at runtime; setting EXCALIDRAW_ASSET_PATH to self-host them didn't take in 0.18
//     (its font worker bypasses the window global), so the CDN allowance stays. A font load
//     can't exfil data, so this is a narrow, low-risk exception.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseHost = new URL(supabaseUrl).host;
const httpProto = supabaseUrl.startsWith("https") ? "https" : "http";
const wsProto = httpProto === "https" ? "wss" : "ws";
const devEval =
  process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

// Keep violation telemetry after the flip — parse the Sentry DSN
// (https://<key>@<host>/<projectId>) into its Security-report endpoint.
let cspReportUri = "";
try {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    cspReportUri = `; report-uri https://${u.host}/api/${projectId}/security/?sentry_key=${u.username}`;
  }
} catch {
  // malformed DSN — skip the report-uri, the policy still enforces
}

// Cloudflare Turnstile (the login-page CAPTCHA) — its api.js and the widget iframe.
// challenges.cloudflare.com serves api.js + the widget; interactive challenges use per-session
// subdomains (e.g. brunhild.challenges.cloudflare.com), and a CSP host doesn't cover subdomains
// — so allow both the apex and `*.challenges.cloudflare.com`.
const turnstile =
  "https://challenges.cloudflare.com https://*.challenges.cloudflare.com";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${devEval} https://va.vercel-scripts.com ${turnstile}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' https://esm.sh",
  `connect-src 'self' ${httpProto}://${supabaseHost} ${wsProto}://${supabaseHost} https://esm.sh https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://vitals.vercel-insights.com ${turnstile}`,
  `frame-src ${turnstile}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ") + cspReportUri;

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
          { key: "Content-Security-Policy", value: CSP },
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
