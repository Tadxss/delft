import { test, expect } from "@playwright/test";
import { openSidebar, signIn, uniqueEmail } from "./helpers";

test("publishing a canvas makes it viewable, read-only, at /share/canvas/[slug] — and unpublishing takes it down again", async ({
  page,
  browser,
}) => {
  await signIn(page, uniqueEmail("publish-share-canvas"));

  await page.fill("#workspace-name", "Boards");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await openSidebar(page);
  await page.click('button[aria-label="New canvas"]:visible');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+\/canvas\/[^/]+$/, {
    timeout: 15000,
  });
  await page.locator('input[placeholder="Untitled"]').fill("Public board");

  // Draw a rectangle so the shared scene isn't empty — same technique as canvas.spec.ts.
  const canvasArea = page.locator(".excalidraw__canvas").first();
  const box = await canvasArea.boundingBox();
  if (!box) throw new Error("Excalidraw canvas not found");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.keyboard.press("r");
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.55);
  await page.mouse.up();
  await page.waitForTimeout(1500);

  // Publish
  await page.click('button:has-text("Publish")');
  await expect(page.getByRole("button", { name: "Published" })).toBeVisible({
    timeout: 10000,
  });
  const shareLink = await page
    .locator('a[href*="/share/canvas/"]')
    .getAttribute("href");
  expect(shareLink).toBeTruthy();

  // View it as a signed-out visitor, in a completely separate browser context
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  const anonResponse = await anonPage.goto(shareLink!);
  expect(anonResponse?.status()).toBe(200);
  await expect(anonPage.locator(".excalidraw__canvas").first()).toBeVisible();
  // Read-only (viewModeEnabled): the shape-tool toolbar isn't rendered at all.
  await expect(
    anonPage.locator('[data-testid="toolbar-rectangle"]'),
  ).toHaveCount(0);
  await anonContext.close();

  // Unpublish and confirm the share URL no longer serves the canvas
  await page.click('button:has-text("Published")');
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeVisible({ timeout: 10000 });

  const anonContext2 = await browser.newContext();
  const anonPage2 = await anonContext2.newPage();
  const response = await anonPage2.goto(shareLink!);
  expect(response?.status()).toBe(404);
  await anonContext2.close();
});
