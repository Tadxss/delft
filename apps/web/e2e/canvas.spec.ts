import { test, expect } from "@playwright/test";
import {
  dragElementOnto,
  onlyVisible,
  openSidebar,
  reorderStripBefore,
  signIn,
  uniqueEmail,
} from "./helpers";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// Excalidraw renders to a <canvas> element, not addressable DOM nodes per shape — rather than
// fighting pixel-level assertions to "see" a drawn rectangle survived a reload, this reads the
// signed-in user's own access token out of localStorage and asks the REST API directly whether
// `scene.elements` actually has content, which is what autosave is actually responsible for.
async function getAccessToken(
  page: import("@playwright/test").Page,
): Promise<string> {
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

test("create a canvas, draw a shape, and confirm autosave persists it", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("canvas"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await openSidebar(page);
  await page.click('button[aria-label="New canvas"]:visible');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+\/canvas\/[^/]+$/, {
    timeout: 15000,
  });

  await page.locator('input[placeholder="Untitled"]').fill("Whiteboard");

  // Select the rectangle tool and drag out a shape on the canvas. The title input still has focus
  // after fill(), which would swallow the "r" shortcut as text instead of Excalidraw seeing it —
  // click the canvas area first to move focus off the input. Selecting a drawing tool opens a
  // floating properties panel (stroke/background/etc.) docked at the canvas's left edge, so the
  // shape itself must be drawn well clear of it (well to the right), not near the top-left corner.
  //
  // Real bug found via mobile-viewport e2e coverage: fixed pixel offsets (`box.x + 700`) were
  // sized for the desktop chromium/webkit projects' ~1280px-wide viewport — on `mobile-safari`'s
  // 390px-wide `devices["iPhone 13"]` viewport, `box.x + 700` lands off-screen entirely, so the
  // "drag" never touched the actual canvas and nothing got drawn. Using fractions of the canvas's
  // own bounding box instead scales correctly to whatever viewport the project renders at.
  const canvasArea = page.locator(".excalidraw__canvas").first();
  const box = await canvasArea.boundingBox();
  if (!box) throw new Error("Excalidraw canvas not found");
  const focusX = box.x + box.width * 0.5;
  const focusY = box.y + box.height * 0.5;
  const startX = box.x + box.width * 0.6;
  const startY = box.y + box.height * 0.35;
  const endX = box.x + box.width * 0.85;
  const endY = box.y + box.height * 0.55;
  await page.mouse.click(focusX, focusY);
  await page.keyboard.press("r");
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY);
  await page.mouse.up();

  // Wait past the 800ms autosave debounce + a network round trip.
  await page.waitForTimeout(1500);

  const canvasId = page.url().split("/canvas/")[1];
  const accessToken = await getAccessToken(page);
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/canvases?id=eq.${canvasId}&select=title,scene`,
    {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
    },
  );
  const rows = (await res.json()) as {
    title: string;
    scene: { elements: unknown[] };
  }[];
  const row = rows[0];
  if (!row) throw new Error("Canvas row not found via REST");
  expect(row.title).toBe("Whiteboard");
  expect(row.scene.elements.length).toBeGreaterThan(0);

  // Reload and confirm the title survived too (same visible check the Pages suite uses).
  await page.reload();
  await expect(page.locator('input[placeholder="Untitled"]')).toHaveValue(
    "Whiteboard",
  );

  // Delete and confirm it's gone from the sidebar. Deletion navigates to the bare workspace id
  // (no slug prefix), same convention as PageEditor's own delete handler.
  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Delete")');
  await page.waitForURL(/\/workspace\/[^/]+$/, { timeout: 15000 });
  await openSidebar(page);
  await expect(
    onlyVisible(page.getByText("Your canvas is blank. What will you draw?")),
  ).toBeVisible();
});

test("drag-and-drop reorders sibling canvases, and the new order survives a reload", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("canvas-reorder"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  // Each "New canvas" click while already on a /canvas/[id] URL needs a "the URL must actually
  // change" wait, not a bare pattern match — a plain waitForURL would resolve instantly against
  // whatever /canvas/[id] URL we're already on (see workspace-pages.spec.ts's matching page-
  // creation helper for the same issue), filling the title into the about-to-be-unmounted old
  // canvas's input instead of the new one's.
  async function createCanvas(title: string) {
    await openSidebar(page);
    const urlBefore = page.url();
    await page.click('button[aria-label="New canvas"]:visible');
    await page.waitForURL(
      (url) =>
        url.href !== urlBefore &&
        /\/workspace\/[^/]+--[^/]+\/canvas\/[^/]+$/.test(url.pathname),
      { timeout: 15000 },
    );
    await page.locator('input[placeholder="Untitled"]').fill(title);
    await page.waitForTimeout(1500);
  }
  await createCanvas("Sketch One");
  await createCanvas("Sketch Two");
  await createCanvas("Sketch Three");

  await openSidebar(page);
  const oneLink = onlyVisible(page.getByRole("link", { name: "Sketch One" }));
  const twoLink = onlyVisible(page.getByRole("link", { name: "Sketch Two" }));
  const threeLink = onlyVisible(page.getByRole("link", { name: "Sketch Three" }));
  await expect(oneLink).toBeVisible();
  await expect(twoLink).toBeVisible();
  await expect(threeLink).toBeVisible();

  const initialOne = await oneLink.boundingBox();
  const initialTwo = await twoLink.boundingBox();
  const initialThree = await threeLink.boundingBox();
  if (!initialOne || !initialTwo || !initialThree) {
    throw new Error("Could not find bounding boxes for canvases");
  }
  expect(initialOne.y).toBeLessThan(initialTwo.y);
  expect(initialTwo.y).toBeLessThan(initialThree.y);

  // Drag "Sketch Three" onto the strip right before "Sketch One" — moves it to the front.
  await dragElementOnto(
    page,
    threeLink.locator(".."),
    reorderStripBefore(oneLink),
  );
  // No optimistic update — the reordered position only appears once the invalidate-and-refetch
  // round trip lands, not the instant the drop event fires.
  await page.waitForTimeout(600);

  const afterOne = await oneLink.boundingBox();
  const afterTwo = await twoLink.boundingBox();
  const afterThree = await threeLink.boundingBox();
  if (!afterOne || !afterTwo || !afterThree) {
    throw new Error("Could not find bounding boxes for canvases after drag");
  }
  expect(afterThree.y).toBeLessThan(afterOne.y);
  expect(afterOne.y).toBeLessThan(afterTwo.y);

  // Reload — confirms the reordered position was actually persisted, not just client-side state.
  await page.reload();
  await openSidebar(page);
  const reloadedOne = await onlyVisible(
    page.getByRole("link", { name: "Sketch One" }),
  ).boundingBox();
  const reloadedTwo = await onlyVisible(
    page.getByRole("link", { name: "Sketch Two" }),
  ).boundingBox();
  const reloadedThree = await onlyVisible(
    page.getByRole("link", { name: "Sketch Three" }),
  ).boundingBox();
  if (!reloadedOne || !reloadedTwo || !reloadedThree) {
    throw new Error("Could not find bounding boxes for canvases after reload");
  }
  expect(reloadedThree.y).toBeLessThan(reloadedOne.y);
  expect(reloadedOne.y).toBeLessThan(reloadedTwo.y);
});
