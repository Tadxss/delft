import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("publishing a page makes it viewable, read-only, at /share/[slug] — and unpublishing takes it down again", async ({
  page,
  browser,
}) => {
  await signIn(page, uniqueEmail("publish-share"));

  await page.fill("#workspace-name", "Notes");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await page.click('button[aria-label="New page"]');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/, { timeout: 15000 });
  await page.locator('input[placeholder="Untitled"]').fill("Public doc");
  const editorRegion = page.locator('[contenteditable="true"]').first();
  await editorRegion.click();
  await page.keyboard.type("Content visible to anyone with the link.");
  await page.waitForTimeout(1500);

  // Publish
  await page.click('button:has-text("Publish")');
  await expect(page.getByRole("button", { name: "Published" })).toBeVisible({ timeout: 10000 });
  const shareLink = await page.locator('a[href*="/share/"]').getAttribute("href");
  expect(shareLink).toBeTruthy();

  // View it as a signed-out visitor, in a completely separate browser context
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  await anonPage.goto(shareLink!);
  await expect(anonPage.getByText("Content visible to anyone with the link.")).toBeVisible();
  // Read-only: no toolbar/slash-menu/editable chrome should be present.
  await expect(anonPage.locator('[contenteditable="true"]')).toHaveCount(0);
  await anonContext.close();

  // Unpublish and confirm the share URL no longer serves the content
  await page.click('button:has-text("Published")');
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible({ timeout: 10000 });

  const anonContext2 = await browser.newContext();
  const anonPage2 = await anonContext2.newPage();
  const response = await anonPage2.goto(shareLink!);
  expect(response?.status()).toBe(404);
  await anonContext2.close();
});
