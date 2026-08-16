import { test, expect, type Page } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

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
});

test("move a credential between folders via the edit form, and a folder via the move dialog", async ({
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
  // Now a root-level credential — visible immediately, no expand needed.
  await expect(
    page.getByRole("button", { name: "Chase", exact: true }),
  ).toBeVisible();

  // Create a second root folder, move "Work" into it via the move dialog.
  await createRootFolder(page, "Personal");
  const workRow = folderRow(page, "Work");
  await workRow.hover();
  await workRow.getByRole("button", { name: "Move folder" }).click();
  await page.selectOption("select >> nth=-1", { label: "Personal" });
  await page.click('button:has-text("Move")');
  await expect(
    page.getByRole("button", { name: "Move", exact: true }),
  ).not.toBeVisible();

  // "Work" is now nested under the (collapsed) "Personal" folder, so it's not visible at root...
  await expect(page.locator("button", { hasText: "Work" })).not.toBeVisible();
  // ...until "Personal" is expanded.
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
