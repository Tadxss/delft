import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// Excalidraw renders to a <canvas> element, not addressable DOM nodes per shape — rather than
// fighting pixel-level assertions to "see" a drawn rectangle survived a reload, this reads the
// signed-in user's own access token out of localStorage and asks the REST API directly whether
// `scene.elements` actually has content, which is what autosave is actually responsible for.
async function getAccessToken(page: import("@playwright/test").Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { access_token?: string };
        if (parsed.access_token) return parsed.access_token;
      } catch {
        // not a JSON-parseable entry, skip
      }
    }
    return null;
  });
  if (!token) throw new Error("No Supabase access token found in localStorage");
  return token;
}

test("create a canvas, draw a shape, and confirm autosave persists it", async ({ page }) => {
  await signIn(page, uniqueEmail("canvas"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await page.click('button[aria-label="New canvas"]');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+\/canvas\/[^/]+$/, { timeout: 15000 });

  await page.locator('input[placeholder="Untitled"]').fill("Whiteboard");

  // Select the rectangle tool and drag out a shape on the canvas. The title input still has focus
  // after fill(), which would swallow the "r" shortcut as text instead of Excalidraw seeing it —
  // click the canvas area first to move focus off the input. Selecting a drawing tool opens a
  // floating properties panel (stroke/background/etc.) docked at the canvas's left edge, so the
  // shape itself must be drawn well clear of it (well to the right), not near the top-left corner.
  const canvasArea = page.locator(".excalidraw__canvas").first();
  const box = await canvasArea.boundingBox();
  if (!box) throw new Error("Excalidraw canvas not found");
  await page.mouse.click(box.x + 700, box.y + 400);
  await page.keyboard.press("r");
  await page.mouse.move(box.x + 700, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 900, box.y + 450);
  await page.mouse.up();

  // Wait past the 800ms autosave debounce + a network round trip.
  await page.waitForTimeout(1500);

  const canvasId = page.url().split("/canvas/")[1];
  const accessToken = await getAccessToken(page);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/canvases?id=eq.${canvasId}&select=title,scene`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  const rows = (await res.json()) as { title: string; scene: { elements: unknown[] } }[];
  const row = rows[0];
  if (!row) throw new Error("Canvas row not found via REST");
  expect(row.title).toBe("Whiteboard");
  expect(row.scene.elements.length).toBeGreaterThan(0);

  // Reload and confirm the title survived too (same visible check the Pages suite uses).
  await page.reload();
  await expect(page.locator('input[placeholder="Untitled"]')).toHaveValue("Whiteboard");

  // Delete and confirm it's gone from the sidebar. Deletion navigates to the bare workspace id
  // (no slug prefix), same convention as PageEditor's own delete handler.
  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Delete")');
  await page.waitForURL(/\/workspace\/[^/]+$/, { timeout: 15000 });
  await expect(page.getByText("No canvases yet.")).toBeVisible();
});
