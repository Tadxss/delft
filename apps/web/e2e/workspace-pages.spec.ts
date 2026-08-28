import { test, expect, type Page } from "@playwright/test";
import {
  dragElementOnto,
  onlyVisible,
  openSidebar,
  reorderStripBefore,
  signIn,
  uniqueEmail,
} from "./helpers";

// Creates a root page via the sidebar "+" and commits a title — shared by the reorder test below,
// which needs several root pages created in a known order.
async function createRootPage(page: Page, title: string): Promise<void> {
  await openSidebar(page);
  const urlBefore = page.url();
  await page.click('button[aria-label="New page"]:visible');
  await page.waitForURL(
    (url) =>
      url.href !== urlBefore &&
      /\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/.test(url.pathname),
    { timeout: 15000 },
  );
  await page.locator('input[placeholder="Untitled"]').fill(title);
  await page.waitForTimeout(1500);
}

test("create a workspace, create nested pages, edit content, and confirm autosave persists", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("workspace-crud"));

  // Create workspace
  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  // Create a root page via the sidebar "+"
  await openSidebar(page);
  await page.click('button[aria-label="New page"]:visible');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/, {
    timeout: 15000,
  });

  // Title
  const titleInput = page.locator('input[placeholder="Untitled"]');
  await titleInput.fill("Meeting notes");

  // Content — type into BlockNote's editable area
  const editorRegion = page.locator('[contenteditable="true"]').first();
  await editorRegion.click();
  await page.keyboard.type("First line of real content.");

  // Wait past the 800ms autosave debounce + a network round trip
  await page.waitForTimeout(1500);

  // The top-bar "Edited …" indicator reflects the just-saved write.
  await expect(page.getByText(/^Edited /)).toBeVisible();

  // Reload and confirm both title and content survived the round trip through Postgres
  await page.reload();
  await expect(page.locator('input[placeholder="Untitled"]')).toHaveValue(
    "Meeting notes",
  );
  await expect(page.getByText("First line of real content.")).toBeVisible();

  // The saved page should also now show its title in the sidebar tree instead of "Untitled"
  await openSidebar(page);
  const pageLink = onlyVisible(
    page.getByRole("link", { name: "Meeting notes" }),
  );
  await expect(pageLink).toBeVisible();

  // Create a nested sub-page from the tree node's hover "+" control
  const treeNode = pageLink.locator("..");
  await treeNode.hover();
  const urlBeforeSubPage = page.url();
  await treeNode.getByRole("button", { name: "Add sub-page" }).click();
  // We're already on a /workspace/.../p/... URL (the parent's own edit page) before this click, so
  // a plain pattern-match waitForURL would resolve instantly against the URL we're already on
  // instead of waiting for the actual navigation to the new sub-page — require the URL to
  // genuinely change.
  await page.waitForURL(
    (url) =>
      url.href !== urlBeforeSubPage &&
      /\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/.test(url.pathname),
    { timeout: 15000 },
  );
  await page.locator('input[placeholder="Untitled"]').fill("Sub-page");
  await page.waitForTimeout(1500);

  // Reload (a real persistence check, not just cache state) and re-expand the parent — expand
  // state is client-only and resets on reload, unlike the tree structure/titles themselves.
  await page.reload();
  await openSidebar(page);
  await onlyVisible(page.getByRole("button", { name: "Expand" }))
    .first()
    .click();
  const subPageLink = onlyVisible(page.getByRole("link", { name: "Sub-page" }));
  await expect(subPageLink).toBeVisible();

  // Regression check: toggling a NESTED page (a child, not a root) via a plain click, with no
  // other data change happening at the same time. A previous version of the tree's re-render
  // optimization computed a page's expanded state only when its *parent* re-rendered — so
  // toggling "Sub-page" (a child of the root "Meeting notes") didn't visibly update anything,
  // because "Meeting notes" saw its own expanded state as unchanged and skipped re-rendering,
  // silently dropping "Sub-page"'s fresh state along with it.
  const subPageTreeNode = subPageLink.locator("..");
  await subPageTreeNode.hover();
  const urlBeforeGrandchild = page.url();
  await subPageTreeNode.getByRole("button", { name: "Add sub-page" }).click();
  await page.waitForURL(
    (url) =>
      url.href !== urlBeforeGrandchild &&
      /\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/.test(url.pathname),
    { timeout: 15000 },
  );
  await page.locator('input[placeholder="Untitled"]').fill("Grandchild");
  await page.waitForTimeout(1500);

  // Below `md`, SidebarShell's drawer only mounts its own <Sidebar> instance while open
  // (`{mobileOpen && <Sidebar/>}`) and force-closes on every navigation — so on mobile viewports
  // this navigation just unmounted the drawer's Sidebar, resetting its expand state entirely.
  // Desktop's Sidebar instance is never unmounted (just CSS-hidden below `md`), so its expand
  // state already survived the navigation and these re-expands are correctly skipped there.
  await openSidebar(page);
  const meetingNotesRow = onlyVisible(
    page.getByRole("link", { name: "Meeting notes" }),
  ).locator("..");
  if (
    await meetingNotesRow.getByRole("button", { name: "Expand" }).isVisible()
  ) {
    await meetingNotesRow.getByRole("button", { name: "Expand" }).click();
  }
  const subPageRow = onlyVisible(
    page.getByRole("link", { name: "Sub-page" }),
  ).locator("..");
  if (await subPageRow.getByRole("button", { name: "Expand" }).isVisible()) {
    await subPageRow.getByRole("button", { name: "Expand" }).click();
  }
  const grandchildLink = onlyVisible(
    page.getByRole("link", { name: "Grandchild" }),
  );
  await expect(grandchildLink).toBeVisible();

  // Pure click, no data change alongside it — this is the exact path that was broken.
  await subPageRow.getByRole("button", { name: "Collapse" }).click();
  await expect(grandchildLink).not.toBeVisible();
  await subPageRow.getByRole("button", { name: "Expand" }).click();
  await expect(grandchildLink).toBeVisible();
});

test("drag-and-drop reparents pages, including moving one back to root", async ({ page }) => {
  await signIn(page, uniqueEmail("workspace-dnd"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  // Two root pages. Each "New page" click while already on a /p/[id] URL needs a "the URL must
  // actually change" wait, not a bare pattern match — see the sub-page creation above for why a
  // plain waitForURL resolves instantly against whatever /p/[id] URL we're already on.
  await openSidebar(page);
  let urlBeforeNewPage = page.url();
  await page.click('button[aria-label="New page"]:visible');
  await page.waitForURL(
    (url) =>
      url.href !== urlBeforeNewPage &&
      /\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/.test(url.pathname),
    { timeout: 15000 },
  );
  await page.locator('input[placeholder="Untitled"]').fill("Notes");
  await page.waitForTimeout(1500);

  await openSidebar(page);
  urlBeforeNewPage = page.url();
  await page.click('button[aria-label="New page"]:visible');
  await page.waitForURL(
    (url) =>
      url.href !== urlBeforeNewPage &&
      /\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/.test(url.pathname),
    { timeout: 15000 },
  );
  await page.locator('input[placeholder="Untitled"]').fill("Archive");
  await page.waitForTimeout(1500);

  await openSidebar(page);
  const notesLink = onlyVisible(page.getByRole("link", { name: "Notes" }));
  const archiveLink = onlyVisible(page.getByRole("link", { name: "Archive" }));
  await expect(notesLink).toBeVisible();
  await expect(archiveLink).toBeVisible();

  // Drag "Notes" onto "Archive" to reparent it.
  await dragElementOnto(page, notesLink.locator(".."), archiveLink.locator(".."));

  // "Notes" is no longer a root page — until "Archive" is expanded to reveal it as a child.
  // Scoped to Archive's own row for the same reason noted below on the later Collapse click.
  await expect(onlyVisible(page.getByRole("link", { name: "Notes" }))).not.toBeVisible();
  await archiveLink.locator("..").getByRole("button", { name: "Expand", exact: true }).click();
  const nestedNotesLink = onlyVisible(page.getByRole("link", { name: "Notes" }));
  await expect(nestedNotesLink).toBeVisible();

  // Drag it back onto the "Pages" section header to move it back to root. Once this lands,
  // "Notes" is visible directly as a root page — no need to touch "Archive" at all, and in fact
  // its own expand/collapse toggle disappears once it has no children left to show.
  const pagesHeader = onlyVisible(page.getByText("Pages", { exact: true })).locator("..");
  await dragElementOnto(page, nestedNotesLink.locator(".."), pagesHeader);
  await expect(onlyVisible(page.getByRole("link", { name: "Notes" }))).toBeVisible();
});

test("drag-and-drop reorders sibling pages, at root and nested", async ({ page }) => {
  await signIn(page, uniqueEmail("workspace-reorder"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  // Three root pages, created (and thus initially ordered) Alpha, Beta, Gamma.
  await createRootPage(page, "Alpha");
  await createRootPage(page, "Beta");
  await createRootPage(page, "Gamma");

  await openSidebar(page);
  const alphaLink = onlyVisible(page.getByRole("link", { name: "Alpha" }));
  const betaLink = onlyVisible(page.getByRole("link", { name: "Beta" }));
  const gammaLink = onlyVisible(page.getByRole("link", { name: "Gamma" }));
  await expect(alphaLink).toBeVisible();
  await expect(betaLink).toBeVisible();
  await expect(gammaLink).toBeVisible();

  const initialAlpha = await alphaLink.boundingBox();
  const initialBeta = await betaLink.boundingBox();
  const initialGamma = await gammaLink.boundingBox();
  if (!initialAlpha || !initialBeta || !initialGamma) {
    throw new Error("Could not find bounding boxes for root pages");
  }
  expect(initialAlpha.y).toBeLessThan(initialBeta.y);
  expect(initialBeta.y).toBeLessThan(initialGamma.y);

  // Drag "Gamma" onto the strip right before "Alpha" — moves it to the very front.
  await dragElementOnto(
    page,
    gammaLink.locator(".."),
    reorderStripBefore(alphaLink),
  );
  // No optimistic update (deliberate, matches every other mutation in this app) — the reordered
  // position only appears once the invalidate-and-refetch round trip lands, not the instant the
  // drop event fires.
  await page.waitForTimeout(600);

  const afterAlpha = await alphaLink.boundingBox();
  const afterBeta = await betaLink.boundingBox();
  const afterGamma = await gammaLink.boundingBox();
  if (!afterAlpha || !afterBeta || !afterGamma) {
    throw new Error("Could not find bounding boxes for root pages after drag");
  }
  expect(afterGamma.y).toBeLessThan(afterAlpha.y);
  expect(afterAlpha.y).toBeLessThan(afterBeta.y);

  // Same drag interaction reordering two NESTED siblings (children of one parent), not just root
  // pages — the reorder strips are rendered recursively by PageTreeNode itself, not just Sidebar's
  // root list, so this exercises a different code path than the root-level drag above.
  await page.mouse.move(700, 400);
  await page.waitForTimeout(500);

  const alphaRow = alphaLink.locator("..");
  await alphaRow.hover();
  const urlBeforeChild1 = page.url();
  await alphaRow.getByRole("button", { name: "Add sub-page" }).click();
  await page.waitForURL(
    (url) =>
      url.href !== urlBeforeChild1 &&
      /\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/.test(url.pathname),
    { timeout: 15000 },
  );
  await page.locator('input[placeholder="Untitled"]').fill("Child One");
  await page.waitForTimeout(1500);

  await openSidebar(page);
  const alphaRowAgain = onlyVisible(page.getByRole("link", { name: "Alpha" })).locator("..");
  await alphaRowAgain.hover();
  const urlBeforeChild2 = page.url();
  await alphaRowAgain.getByRole("button", { name: "Add sub-page" }).click();
  await page.waitForURL(
    (url) =>
      url.href !== urlBeforeChild2 &&
      /\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/.test(url.pathname),
    { timeout: 15000 },
  );
  await page.locator('input[placeholder="Untitled"]').fill("Child Two");
  await page.waitForTimeout(1500);

  // Below `md`, the sidebar drawer unmounts its own Sidebar instance on every navigation, resetting
  // its expand state — the auto-expand from creating "Child One"/"Child Two" doesn't survive that on
  // mobile viewports (desktop's Sidebar instance is never unmounted, so it's unaffected). Same
  // conditional re-expand this file's first test already uses for the same reason.
  await openSidebar(page);
  const alphaRowFinal = onlyVisible(page.getByRole("link", { name: "Alpha" })).locator("..");
  if (await alphaRowFinal.getByRole("button", { name: "Expand" }).isVisible()) {
    await alphaRowFinal.getByRole("button", { name: "Expand" }).click();
  }
  const child1Link = onlyVisible(page.getByRole("link", { name: "Child One" }));
  const child2Link = onlyVisible(page.getByRole("link", { name: "Child Two" }));
  await expect(child1Link).toBeVisible();
  await expect(child2Link).toBeVisible();

  const initialChild1 = await child1Link.boundingBox();
  const initialChild2 = await child2Link.boundingBox();
  if (!initialChild1 || !initialChild2) {
    throw new Error("Could not find bounding boxes for child pages");
  }
  expect(initialChild1.y).toBeLessThan(initialChild2.y);

  // Drag "Child Two" onto the strip right before "Child One" — swaps their order.
  await dragElementOnto(
    page,
    child2Link.locator(".."),
    reorderStripBefore(child1Link),
  );
  await page.waitForTimeout(600);

  const afterChild1 = await child1Link.boundingBox();
  const afterChild2 = await child2Link.boundingBox();
  if (!afterChild1 || !afterChild2) {
    throw new Error("Could not find bounding boxes for child pages after drag");
  }
  expect(afterChild2.y).toBeLessThan(afterChild1.y);
});
