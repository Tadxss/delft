import { test, expect, type Page } from "@playwright/test";
import { onlyVisible, openSidebar, signIn, uniqueEmail } from "./helpers";

// Open the sidebar (desktop: no-op; mobile: the drawer) and wait for its slide-in to settle
// before touching the section chevrons — the mobile drawer's AnimatePresence remounts the
// `<Sidebar>` and a click fired mid-animation resolves to a detaching element.
async function openSettledSidebar(page: Page) {
  await openSidebar(page);
  await expect(
    onlyVisible(page.getByText("Pages", { exact: true })),
  ).toBeVisible();
  await page.waitForTimeout(300);
}

// The sidebar's PAGES / CANVAS sections collapse independently, and the choice is persisted in
// localStorage (same pattern as the whole-sidebar collapse). Collapsing hides the list but keeps
// the header (chevron + label + "+") visible.
//
// Skipped on mobile-safari: this test opens/closes the off-canvas drawer repeatedly around
// navigations, and the drawer's AnimatePresence remount races the toggle clicks there badly
// enough to be flaky — the same mobile-drawer fragility the workspace-pages drag tests hit.
// Desktop Chrome + WebKit give the real cross-engine coverage; the collapse logic itself is
// viewport-agnostic.
test("sidebar sections collapse, persist across reload, and expand again", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile-safari",
    "mobile off-canvas drawer remount races the section-toggle clicks",
  );
  await signIn(page, uniqueEmail("sidebar-sections"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  // A page (so PAGES has a list) and a canvas (so CANVAS has a list).
  await openSidebar(page);
  await page.click('button[aria-label="New page"]:visible');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/, {
    timeout: 15000,
  });
  await page.locator('input[placeholder="Untitled"]').fill("Runbook");
  await page.waitForTimeout(1200);

  await openSidebar(page);
  await page.click('button[aria-label="New canvas"]:visible');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+\/canvas\/[^/]+$/, {
    timeout: 15000,
  });

  await openSettledSidebar(page);
  const pageLink = onlyVisible(page.getByRole("link", { name: "Runbook" }));
  await expect(pageLink).toBeVisible();

  // Collapse PAGES → its list hides, header + label stay.
  await onlyVisible(page.getByRole("button", { name: "Hide pages" })).click();
  await expect(pageLink).toHaveCount(0);
  await expect(onlyVisible(page.getByText("Pages", { exact: true }))).toBeVisible();
  await expect(
    onlyVisible(page.getByRole("button", { name: "New page" })),
  ).toBeVisible();

  // Persists across a reload.
  await page.reload();
  await openSidebar(page);
  await page.waitForTimeout(300);
  await expect(
    onlyVisible(page.getByRole("button", { name: "Show pages" })),
  ).toBeVisible();
  await expect(
    onlyVisible(page.getByRole("link", { name: "Runbook" })),
  ).toHaveCount(0);

  // Expand again.
  await onlyVisible(page.getByRole("button", { name: "Show pages" })).click();
  await expect(
    onlyVisible(page.getByRole("link", { name: "Runbook" })),
  ).toBeVisible();

  // Same for CANVAS.
  await onlyVisible(page.getByRole("button", { name: "Hide canvases" })).click();
  await expect(
    onlyVisible(page.getByRole("link", { name: "Untitled" })),
  ).toHaveCount(0);
  await page.reload();
  await openSidebar(page);
  await page.waitForTimeout(300);
  await expect(
    onlyVisible(page.getByRole("button", { name: "Show canvases" })),
  ).toBeVisible();
});
