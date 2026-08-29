import { test, expect, type Browser, type Page } from "@playwright/test";
import {
  onlyVisible,
  openSidebar,
  openWorkspaceMenu,
  signIn,
  uniqueEmail,
} from "./helpers";

// These are long two-user flows (2 sign-ins + onboarding, invite, accept, role changes, reloads).
test.describe.configure({ timeout: 90_000 });

// Two fully separate browser contexts = two real accounts, per workspace-isolation.spec.ts.
async function newUser(browser: Browser, prefix: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = uniqueEmail(prefix);
  await signIn(page, email);
  return { ctx, page, email };
}

async function openMembers(page: Page) {
  await openWorkspaceMenu(page, "Shared workspace");
  const item = page.getByRole("menuitem", { name: "Members" });
  await item.waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  await item.click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("invite by email → accept → edit as editor → demote to viewer (read-only) → remove", async ({
  browser,
}) => {
  const a = await newUser(browser, "invite-a");
  const b = await newUser(browser, "invite-b");

  // A: create a workspace + a page with content.
  await a.page.fill("#workspace-name", "Shared workspace");
  await a.page.click('button:has-text("Create")');
  await a.page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });
  await openSidebar(a.page);
  await a.page.click('button[aria-label="New page"]:visible');
  await a.page.waitForURL(/\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/, {
    timeout: 15000,
  });
  await a.page.locator('input[placeholder="Untitled"]').fill("Team doc");
  await a.page.locator('[contenteditable="true"]').first().click();
  await a.page.keyboard.type("Original line from A.");
  await a.page.waitForTimeout(1500);

  // A: invite B by email as editor.
  await openMembers(a.page);
  const dialog = a.page.getByRole("dialog");
  await dialog.locator("#member-invite").fill(b.email);
  await dialog.getByRole("combobox", { name: "Role" }).selectOption("editor");
  await dialog.getByRole("button", { name: "Invite" }).click();
  await expect(dialog.getByText(new RegExp(b.email))).toBeVisible();
  await a.page.getByRole("button", { name: "Close" }).click();

  // B: pending invite on the picker → accept → lands in the workspace.
  await b.page.goto("/workspace");
  await expect(b.page.getByText("Pending invitations")).toBeVisible();
  await expect(b.page.getByText("Shared workspace")).toBeVisible();
  await b.page.getByRole("button", { name: "Accept" }).click();
  await b.page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  // B: can see A's page, and as an editor can create a new one (RLS insert must succeed).
  await openSidebar(b.page);
  await expect(
    onlyVisible(b.page.getByRole("link", { name: "Team doc" })),
  ).toBeVisible();
  await b.page.click('button[aria-label="New page"]:visible');
  await b.page.waitForURL(/\/workspace\/[^/]+--[^/]+\/p\/[^/]+$/, {
    timeout: 15000,
  });
  await b.page.locator('input[placeholder="Untitled"]').fill("Bs page");
  await b.page.waitForTimeout(1500);
  await b.page.reload();
  await expect(b.page.locator('input[placeholder="Untitled"]')).toHaveValue(
    "Bs page",
    { timeout: 15000 },
  );

  // A: Members modal now lists B as editor. Demote to viewer.
  await openMembers(a.page);
  const membersDialog = a.page.getByRole("dialog");
  await expect(membersDialog.getByText(new RegExp(b.email))).toBeVisible();
  await membersDialog
    .getByRole("combobox", { name: new RegExp("Role for") })
    .selectOption("viewer");
  await a.page.waitForTimeout(500);
  await a.page.getByRole("button", { name: "Close" }).click();

  // B: reload → editor is read-only, no "New page" button, no Credentials Vault.
  await b.page.reload();
  await expect(b.page.locator('[contenteditable="false"]').first()).toBeVisible();
  await expect(b.page.getByText("View only")).toBeVisible();
  await openSidebar(b.page);
  await expect(
    onlyVisible(b.page.getByRole("button", { name: "New page" })),
  ).toHaveCount(0);
  await onlyVisible(
    b.page.getByRole("button", { name: /Shared workspace/ }),
  ).click();
  await expect(
    b.page.getByRole("menuitem", { name: "Credentials Vault" }),
  ).toHaveCount(0);
  await b.page.keyboard.press("Escape");

  // A: remove B → B's picker no longer lists the workspace, and the URL shows the empty state.
  const bWorkspaceUrl = b.page.url();
  await openMembers(a.page);
  a.page.once("dialog", (d) => d.accept());
  await a.page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove" })
    .click();
  await a.page.waitForTimeout(500);

  await b.page.goto("/workspace");
  await expect(b.page.getByText("Shared workspace")).toHaveCount(0);
  await b.page.goto(bWorkspaceUrl);
  await openSidebar(b.page);
  await expect(onlyVisible(b.page.getByText("No pages yet."))).toBeVisible();

  await a.ctx.close();
  await b.ctx.close();
});

test("invite by @username, and accept via the /invite/[token] link", async ({
  browser,
}) => {
  const a = await newUser(browser, "invite-u-a");
  const b = await newUser(browser, "invite-u-b");
  const bUsername = `b_${Date.now().toString(36)}`;

  // B sets a username (needs a workspace to reach the in-sidebar Account modal).
  await b.page.fill("#workspace-name", "Bs space");
  await b.page.click('button:has-text("Create")');
  await b.page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });
  await openWorkspaceMenu(b.page, "Bs space");
  await b.page.getByRole("menuitem", { name: "Account settings" }).click();
  await b.page
    .getByRole("button", { name: "Update profile", exact: true })
    .click();
  await b.page.fill("#username", bUsername);
  await b.page.getByRole("button", { name: "Save profile" }).click();
  await expect(b.page.getByText("Profile saved.")).toBeVisible({
    timeout: 10000,
  });
  await b.page.getByRole("button", { name: "Close" }).click();

  // A: create workspace, invite @b_the_editor as viewer.
  await a.page.fill("#workspace-name", "Shared workspace");
  await a.page.click('button:has-text("Create")');
  await a.page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });
  await openMembers(a.page);
  const dialog = a.page.getByRole("dialog");
  await dialog.locator("#member-invite").fill(`@${bUsername}`);
  await dialog.getByRole("combobox", { name: "Role" }).selectOption("viewer");
  await dialog.getByRole("button", { name: "Invite" }).click();
  await expect(dialog.getByText(`@${bUsername}`)).toBeVisible();
  // Grab the copy-link shown in the invite-success box.
  const link = await dialog
    .getByText(/\/invite\//)
    .first()
    .textContent();
  await a.page.getByRole("button", { name: "Close" }).click();

  // B: open the invite link directly → Accept.
  await b.page.goto(link!.trim());
  await expect(b.page.getByText(/invited you to join as viewer/)).toBeVisible();
  await b.page.getByRole("button", { name: "Accept" }).click();
  await b.page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await a.ctx.close();
  await b.ctx.close();
});
