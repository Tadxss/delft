import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("create a workspace, create nested pages, edit content, and confirm autosave persists", async ({ page }) => {
  await signIn(page, uniqueEmail("workspace-crud"));

  // Create workspace
  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  // Create a root page via the sidebar "+"
  await page.click('button[aria-label="New page"]');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/, { timeout: 15000 });

  // Title
  const titleInput = page.locator('input[placeholder="Untitled"]');
  await titleInput.fill("Meeting notes");

  // Content — type into BlockNote's editable area
  const editorRegion = page.locator('[contenteditable="true"]').first();
  await editorRegion.click();
  await page.keyboard.type("First line of real content.");

  // Wait past the 800ms autosave debounce + a network round trip
  await page.waitForTimeout(1500);

  // Reload and confirm both title and content survived the round trip through Postgres
  await page.reload();
  await expect(page.locator('input[placeholder="Untitled"]')).toHaveValue("Meeting notes");
  await expect(page.getByText("First line of real content.")).toBeVisible();

  // The saved page should also now show its title in the sidebar tree instead of "Untitled"
  await expect(page.getByRole("link", { name: "Meeting notes" })).toBeVisible();

  // Create a nested sub-page from the tree node's hover "+" control
  const treeNode = page.getByRole("link", { name: "Meeting notes" }).locator("..");
  await treeNode.hover();
  const urlBeforeSubPage = page.url();
  await treeNode.getByRole("button", { name: "Add sub-page" }).click();
  // We're already on a /workspace/.../p/... URL (the parent's own edit page) before this click, so
  // a plain pattern-match waitForURL would resolve instantly against the URL we're already on
  // instead of waiting for the actual navigation to the new sub-page — require the URL to
  // genuinely change.
  await page.waitForURL(
    (url) => url.href !== urlBeforeSubPage && /\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/.test(url.pathname),
    { timeout: 15000 },
  );
  await page.locator('input[placeholder="Untitled"]').fill("Sub-page");
  await page.waitForTimeout(1500);

  // Reload (a real persistence check, not just cache state) and re-expand the parent — expand
  // state is client-only and resets on reload, unlike the tree structure/titles themselves.
  await page.reload();
  await page.getByRole("button", { name: "Expand" }).first().click();
  await expect(page.getByRole("link", { name: "Sub-page" })).toBeVisible();
});
