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
};

export default nextConfig;
