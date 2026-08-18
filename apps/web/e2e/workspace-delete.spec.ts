import { test, expect } from "@playwright/test";
import { onlyVisible, openSidebar, signIn, uniqueEmail } from "./helpers";

test("deleting a workspace removes it from the switcher and its data no longer resolves", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("workspace-delete"));

  await page.fill("#workspace-name", "Throwaway");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });
  const workspaceSlug = new URL(page.url()).pathname.split("/").pop()!;

  // Give it a page, so deletion is actually exercising the on-delete-cascade, not just an empty row.
  await openSidebar(page);
  await page.click('button[aria-label="New page"]:visible');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/, {
    timeout: 15000,
  });

  await page.goto("/workspace");
  await expect(page.getByText("Throwaway")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByText("Throwaway")
    .locator("..")
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(page.getByText("Throwaway")).not.toBeVisible();

  // The workspace and its page are gone at the RLS level too, not just missing from the switcher —
  // revisiting the old URL should show no pages (same "RLS returns zero rows" shape as
  // workspace-isolation.spec.ts, since the row genuinely no longer exists).
  await page.goto(`/workspace/${workspaceSlug}`);
  await openSidebar(page);
  await expect(onlyVisible(page.getByText("No pages yet."))).toBeVisible();
});
