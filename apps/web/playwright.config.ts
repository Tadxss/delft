import { defineConfig, devices } from "@playwright/test";

// Requires the local Supabase stack running (`npx supabase start`) — specs sign in via real
// magic-link email and read the link back from Mailpit's API (127.0.0.1:54324). See
// docs/TESTING.md.
export default defineConfig({
  testDir: "./e2e",
  // Most specs sign in/create workspaces against shared local Supabase state — running fully
  // sequential avoids the cross-spec contention (incl. Supabase's own rate limits) that caused
  // spurious timeouts under concurrency, mirroring votero's e2e setup.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  // CI serves a prebuilt app (`next start`), so 30s is plenty; locally against `pnpm dev` the
  // first hit on a route pays a Turbopack compile, so give it more room.
  timeout: process.env.CI ? 30_000 : 60_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // webkit catches the real Safari/WebKit-engine quirks BETA_READINESS.md item 5 flagged as
  // unverified (browser-image-compression WebP encode support, Excalidraw touch/pointer-event
  // handling, BlockNote/ProseMirror contentEditable behavior) — chromium alone can't surface those.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
  ],
  // CI runs `pnpm --filter web build` as an explicit step first, then serves the prebuilt app
  // with `next start` — no per-route Turbopack compile mid-test, which is what made webkit
  // shards intermittently time out en masse under runner load. Locally, `pnpm dev` with
  // `reuseExistingServer` picks up a dev server you already have running.
  webServer: {
    command: process.env.CI ? "pnpm --filter web start" : "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
