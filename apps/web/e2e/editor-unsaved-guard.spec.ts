import { test, expect } from "@playwright/test";
import { openSidebar, signIn, uniqueEmail } from "./helpers";

// Unsaved-changes guard (Milestone B / item 8). The autosave debounce is ~800ms; before this,
// closing the tab or navigating away inside that window silently dropped the last edit.

test("editing then navigating away in-app still persists the edit (flush on unmount)", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("guard"));
  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await openSidebar(page);
  await page.click('button[aria-label="New page"]:visible');
  await page.waitForURL(/\/p\/[^/]+$/, { timeout: 15000 });
  const firstPageUrl = page.url();

  await page.locator('input[placeholder="Untitled"]').fill("Kept title");
  await page.locator('[contenteditable="true"]').first().click();
  await page.keyboard.type("This line must survive a fast navigation.");

  // Navigate away immediately — well inside the 800ms debounce, so the old behaviour would drop
  // this. New behaviour: the unmount cleanup fires the pending patch.
  await openSidebar(page);
  await page.click('button[aria-label="New page"]:visible');
  await page.waitForURL(
    (url) => /\/p\/[^/]+$/.test(url.href) && url.href !== firstPageUrl,
    { timeout: 15000 },
  );

  // Back to the first page — content and title should have been saved by the flush.
  await page.goto(firstPageUrl);
  await expect(page.locator('input[placeholder="Untitled"]')).toHaveValue(
    "Kept title",
  );
  await expect(
    page.getByText("This line must survive a fast navigation."),
  ).toBeVisible();
});

test("beforeunload is armed while an edit is pending and disarmed once saved", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("guard2"));
  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });
  await openSidebar(page);
  await page.click('button[aria-label="New page"]:visible');
  await page.waitForURL(/\/p\/[^/]+$/, { timeout: 15000 });

  const beforeUnloadPrevented = () =>
    page.evaluate(() => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });

  // Clean page, nothing pending → handler is a no-op.
  expect(await beforeUnloadPrevented()).toBe(false);

  // Make an edit → within the debounce window the handler blocks unload.
  await page.locator('[contenteditable="true"]').first().click();
  await page.keyboard.type("pending");
  expect(await beforeUnloadPrevented()).toBe(true);

  // After autosave settles, it's a no-op again.
  await expect(page.getByText(/^Edited /)).toBeVisible();
  await expect.poll(beforeUnloadPrevented, { timeout: 5000 }).toBe(false);
});
