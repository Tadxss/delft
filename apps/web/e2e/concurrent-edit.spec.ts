import { test, expect } from "@playwright/test";
import { openSidebar, signIn, uniqueEmail } from "./helpers";

// Concurrent-edit stale-write detection (Milestone B / item 9). Two tabs on the same page:
// the one that saves second (against a now-stale updated_at) gets a hard conflict prompt
// instead of silently clobbering the first tab's save.

test("a second tab editing the same page after the first saved gets a conflict prompt", async ({
  context,
}) => {
  const tabA = await context.newPage();
  await signIn(tabA, uniqueEmail("concurrent"));
  await tabA.fill("#workspace-name", "Personal");
  await tabA.click('button:has-text("Create")');
  await tabA.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });
  await openSidebar(tabA);
  await tabA.click('button[aria-label="New page"]:visible');
  await tabA.waitForURL(/\/p\/[^/]+$/, { timeout: 15000 });
  const pageUrl = tabA.url();

  // Tab B opens the same page (shares the session via the context) and loads the same
  // baseline updated_at.
  const tabB = await context.newPage();
  await tabB.goto(pageUrl);
  await expect(tabB.locator('[contenteditable="true"]').first()).toBeVisible();

  // Tab A edits and saves — the row's updated_at moves on.
  await tabA.locator('[contenteditable="true"]').first().click();
  await tabA.keyboard.type("Edit from tab A.");
  await expect(tabA.getByText(/^Edited /)).toBeVisible();
  await tabA.waitForTimeout(500);

  // Tab B edits against its now-stale baseline → conflict, not a silent overwrite.
  await tabB.locator('[contenteditable="true"]').first().click();
  await tabB.keyboard.type("Edit from tab B.");
  await expect(
    tabB.getByText(/changed in another tab or by another editor/i),
  ).toBeVisible({ timeout: 10000 });

  // Tab A's save is intact — reloading tab B shows A's text, not B's.
  await tabB.reload();
  await expect(tabB.getByText("Edit from tab A.")).toBeVisible();
  await expect(tabB.getByText("Edit from tab B.")).toHaveCount(0);
});
