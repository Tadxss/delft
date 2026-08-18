import { test, expect, type Page } from "@playwright/test";
import { backToList, dragElementOnto, signIn, uniqueEmail } from "./helpers";

async function setUpVault(page: Page) {
  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await page.getByRole("button", { name: "Credentials" }).click();
  await page.fill("#passphrase", "the-real-passphrase");
  await page.fill("#confirm", "the-real-passphrase");
  await page.click('button:has-text("Create vault")');
}

// Creates a root-level folder via the toolbar "+ folder" button and commits its inline rename.
async function createRootFolder(page: Page, name: string) {
  await page.click('button[aria-label="New folder"]');
  await page.waitForSelector("li input");
  await page.locator("li input").fill(name);
  await page.keyboard.press("Enter");
}

// The always-visible tree row for a folder — its toggle button (chevron + icon + name) wrapped by
// the "group" div that also holds the hover-revealed action icons.
function folderRow(page: Page, name: string) {
  return page.locator("button", { hasText: name }).first().locator("..");
}

async function createCredentialInFolder(
  page: Page,
  folderName: string,
  credential: { title: string; username: string; password: string },
) {
  const row = folderRow(page, folderName);
  await row.hover();
  await row.getByRole("button", { name: "New credential" }).click();
  await page.fill("#title", credential.title);
  await page.fill("#username", credential.username);
  await page.fill("#password", credential.password);
  await page.click('button:has-text("Save")');
  await expect(
    page.getByRole("heading", { name: credential.title }),
  ).toBeVisible();
}

test("nested folders are collapsed by default and expand/collapse controls what's visible", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("credential-folders"));
  await setUpVault(page);

  await createRootFolder(page, "Work");
  await expect(
    page.locator("button", { hasText: "Work" }).first(),
  ).toBeVisible();

  // Creating a credential inside "Work" via its hover action auto-expands the folder.
  await createCredentialInFolder(page, "Work", {
    title: "Chase",
    username: "alice",
    password: "s3cret-p4ss",
  });
  // Below `md`, creating (and thus selecting) a credential switches CredentialsModal to the
  // single-pane detail view — return to the list before asserting on a list-pane element.
  await backToList(page);
  await expect(
    page.getByRole("button", { name: "Chase", exact: true }),
  ).toBeVisible();

  // Collapse "Work" — its credential is no longer rendered at all (not just hidden via CSS).
  await folderRow(page, "Work").getByRole("button", { name: "Work" }).click();
  await expect(
    page.getByRole("button", { name: "Chase", exact: true }),
  ).not.toBeVisible();

  // Re-expand — it's back.
  await folderRow(page, "Work").getByRole("button", { name: "Work" }).click();
  await expect(
    page.getByRole("button", { name: "Chase", exact: true }),
  ).toBeVisible();

  // Regression check: toggling a NESTED folder (not a root one) via a plain click, with no other
  // data change happening at the same time. A previous version of the tree's re-render
  // optimization computed a folder's expanded state only when its *parent* re-rendered — so
  // toggling "Inner" here didn't visibly update anything, because "Work" (Inner's parent) saw its
  // own expanded state as unchanged and skipped re-rendering, silently dropping Inner's fresh
  // state. Named "Inner" rather than something like "Sub" specifically to avoid colliding with
  // folderRow()'s substring `hasText` match against the "New subfolder" hover-action button.
  const workRow = folderRow(page, "Work");
  await workRow.hover();
  await workRow.getByRole("button", { name: "New subfolder" }).click();
  await page.waitForSelector("li input");
  await page.locator("li input").fill("Inner");
  await page.keyboard.press("Enter");
  // Creating "Inner" itself doesn't force a full re-render burst the way adding a credential does
  // — give it a credential via its own hover action (this DOES auto-expand "Inner" via a real
  // data change, same as "Work" above), then leave that data change behind before the pure-click
  // toggle below.
  await createCredentialInFolder(page, "Inner", {
    title: "Nested",
    username: "carol",
    password: "nested-pass",
  });
  await backToList(page);
  await expect(
    page.getByRole("button", { name: "Nested", exact: true }),
  ).toBeVisible();

  // Pure click, no data change alongside it — this is the exact path that was broken.
  await folderRow(page, "Inner").getByRole("button", { name: "Inner" }).click();
  await expect(
    page.getByRole("button", { name: "Nested", exact: true }),
  ).not.toBeVisible();
  await folderRow(page, "Inner").getByRole("button", { name: "Inner" }).click();
  await expect(
    page.getByRole("button", { name: "Nested", exact: true }),
  ).toBeVisible();
});

test("move a credential between folders via the edit form, and a folder via drag-and-drop", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("credential-folders-move"));
  await setUpVault(page);

  await createRootFolder(page, "Work");
  await createCredentialInFolder(page, "Work", {
    title: "Chase",
    username: "alice",
    password: "s3cret-p4ss",
  });

  // Move the credential to root via the edit form's Folder select.
  await page.click('button:has-text("Edit")');
  await page.selectOption("#folder", { label: "Root" });
  await page.click('button:has-text("Save")');
  await backToList(page);
  // Now a root-level credential — visible immediately, no expand needed.
  await expect(
    page.getByRole("button", { name: "Chase", exact: true }),
  ).toBeVisible();

  // Create a second root folder, drag "Work" onto it to reparent.
  await createRootFolder(page, "Personal");
  await dragElementOnto(page, folderRow(page, "Work"), folderRow(page, "Personal"));

  // "Work" is now nested under the (collapsed) "Personal" folder, so it's not visible at root...
  await expect(page.locator("button", { hasText: "Work" })).not.toBeVisible();
  // ...until "Personal" is expanded.
  await folderRow(page, "Personal")
    .getByRole("button", { name: "Personal" })
    .click();
  await expect(
    page.locator("button", { hasText: "Work" }).first(),
  ).toBeVisible();
  // WebKit/mobile Safari need a longer gap than Chromium between completing one drag and starting
  // another in the same test, or the second drag's pointer/collision state gets confused with the
  // first's (observed: the second drag's onDragEnd reported the same `over` id as the first drag,
  // as if dnd-kit's internal state hadn't fully reset). Moving the pointer to a neutral spot with
  // no droppable/draggable under it, not just waiting in place, is part of forcing that reset.
  await page.mouse.move(700, 400);
  await page.waitForTimeout(1000);

  // Drag "Work" back out to the root drop strip (only rendered while a drag is active).
  const workRow = folderRow(page, "Work");
  const workBox = await workRow.boundingBox();
  if (!workBox) throw new Error('Could not find bounding box for "Work"');
  await page.mouse.move(workBox.x + workBox.width / 2, workBox.y + workBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  const rootStrip = page.getByText("Move to root");
  await expect(rootStrip).toBeVisible();
  const rootStripBox = await rootStrip.boundingBox();
  if (!rootStripBox) throw new Error('Could not find bounding box for "Move to root"');
  // Explicit discrete moves with small waits between them, not a single batched
  // mouse.move(..., { steps }) call — WebKit/mobile Safari's synthetic pointer-event dispatch
  // appeared to let dnd-kit's collision detection go stale across a second drag in the same test
  // (onDragEnd kept reporting the first drag's target) unless genuinely separate pointermove events
  // land with real gaps between them.
  const dropX = rootStripBox.x + rootStripBox.width / 2;
  const dropY = rootStripBox.y + rootStripBox.height / 2;
  const fromX = workBox.x + workBox.width / 2;
  const fromY = workBox.y + workBox.height / 2;
  const moveSteps = 8;
  for (let i = 1; i <= moveSteps; i++) {
    await page.mouse.move(
      fromX + ((dropX - fromX) * i) / moveSteps,
      fromY + ((dropY - fromY) * i) / moveSteps,
    );
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(300);
  await page.mouse.up();

  // Collapse "Personal" — "Work" should still be visible at root, not hidden away inside it.
  await folderRow(page, "Personal")
    .getByRole("button", { name: "Personal" })
    .click();
  await expect(
    page.locator("button", { hasText: "Work" }).first(),
  ).toBeVisible();
});

test("deleting a folder never destroys the credentials inside it, only empty subfolders", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("credential-folders-delete"));
  await setUpVault(page);

  await createRootFolder(page, "Parent");

  // Create "Child" inside "Parent" via its hover "New subfolder" action — auto-expands "Parent".
  const parentRow = folderRow(page, "Parent");
  await parentRow.hover();
  await parentRow.getByRole("button", { name: "New subfolder" }).click();
  await page.waitForSelector("li input");
  await page.locator("li input").fill("Child");
  await page.keyboard.press("Enter");

  await createCredentialInFolder(page, "Child", {
    title: "Leaf",
    username: "bob",
    password: "leaf-pass",
  });
  await backToList(page);

  // Delete "Parent" (which contains "Child" which contains "Leaf") from its own hover action.
  page.once("dialog", (dialog) => dialog.accept());
  const rowToDelete = folderRow(page, "Parent");
  await rowToDelete.hover();
  await rowToDelete.getByRole("button", { name: "Delete folder" }).click();

  // The folder (and its empty subfolder) are gone...
  await expect(page.locator("button", { hasText: "Parent" })).not.toBeVisible();
  // ...but the credential inside survived, reparented to root — visible without expanding anything.
  await expect(
    page.getByRole("button", { name: "Leaf", exact: true }),
  ).toBeVisible();
});
