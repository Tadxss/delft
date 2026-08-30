import { test, expect } from "@playwright/test";
import { openSidebar, signIn, uniqueEmail } from "./helpers";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// Free-tier abuse caps (Milestone B / item 6). The per-workspace and per-user row-count caps
// (2000 pages, 500 canvases, 50 workspaces, …) are verified by a manual psql insert loop during
// migration authoring — 2000-row e2e loops aren't worth the CI minutes and the triggers are
// structurally trivial. This spec covers the per-row content-size CHECK, which is the one a
// client can trip through normal autosave, by PATCHing the row directly (the editor never
// produces 2 MB of text, so driving it through the UI isn't feasible).

async function accessToken(page: import("@playwright/test").Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      const raw = key && window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { access_token?: string };
        if (parsed.access_token) return parsed.access_token;
      } catch {
        /* skip */
      }
    }
    return null;
  });
  if (!token) throw new Error("no access token in localStorage");
  return token;
}

test("pages.content over the size cap is rejected; normal content is fine", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("caps"));
  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });
  await openSidebar(page);
  await page.click('button[aria-label="New page"]:visible');
  await page.waitForURL(/\/p\/[^/]+$/, { timeout: 15000 });
  const pageId = page.url().split("/p/")[1];

  const token = await accessToken(page);
  const patch = (content: unknown) =>
    fetch(`${SUPABASE_URL}/rest/v1/pages?id=eq.${pageId}`, {
      method: "PATCH",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ content }),
    });

  // > 2 MB of JSON text → the pages_content_size CHECK rejects it (PostgREST 400).
  const huge = [{ type: "paragraph", content: "x".repeat(2_100_000) }];
  const bad = await patch(huge);
  expect(bad.status).toBe(400);
  expect(await bad.text()).toContain("pages_content_size");

  // A normal-sized document saves fine.
  const ok = await patch([{ type: "paragraph", content: "hello" }]);
  expect(ok.ok).toBe(true);
});
