import { test, expect, type Browser } from "@playwright/test";
import { openWorkspaceMenu, signIn, uniqueEmail } from "./helpers";

// Workspace ownership transfer (Milestone C / item 12). Owner-only "Make owner" in the Members
// modal; the caller becomes an editor.
test.describe.configure({ timeout: 90_000 });

async function newUser(browser: Browser, prefix: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = uniqueEmail(prefix);
  await signIn(page, email);
  return { ctx, page, email };
}

test("an owner can hand a shared workspace to a member", async ({ browser }) => {
  const a = await newUser(browser, "own-a");
  const b = await newUser(browser, "own-b");

  await a.page.fill("#workspace-name", "Shared workspace");
  await a.page.click('button:has-text("Create")');
  await a.page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  // A invites B, B accepts.
  await openWorkspaceMenu(a.page, "Shared workspace");
  await a.page.getByRole("menuitem", { name: "Members" }).click();
  const dialog = a.page.getByRole("dialog");
  await dialog.locator("#member-invite").fill(b.email);
  await dialog.getByRole("button", { name: "Invite" }).click();
  await expect(dialog.getByText(new RegExp(b.email))).toBeVisible();
  await a.page.getByRole("button", { name: "Close" }).click();

  await b.page.goto("/workspace");
  await b.page.getByRole("button", { name: /Accept/ }).click();
  await b.page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  // A: Members → "Make owner" on B's row.
  await openWorkspaceMenu(a.page, "Shared workspace");
  await a.page.getByRole("menuitem", { name: "Members" }).click();
  a.page.once("dialog", (d) => d.accept());
  await a.page.getByRole("button", { name: "Make owner" }).click();

  // A's Members menu item is gone (owner-only); A is now an editor.
  await openWorkspaceMenu(a.page, "Shared workspace");
  await expect(
    a.page.getByRole("menuitem", { name: "Members" }),
  ).toHaveCount(0);
  await a.page.keyboard.press("Escape");

  // B: now sees the owner-only Members item.
  await b.page.reload();
  await openWorkspaceMenu(b.page, "Shared workspace");
  await expect(
    b.page.getByRole("menuitem", { name: "Members" }),
  ).toBeVisible();

  await a.ctx.close();
  await b.ctx.close();
});
