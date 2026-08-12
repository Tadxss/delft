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
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
