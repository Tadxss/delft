import { test, expect, type Browser } from "@playwright/test";
import {
  getLatestMagicLink,
  openWorkspaceMenu,
  signIn,
  uniqueEmail,
} from "./helpers";

// Self-serve account deletion (production-readiness Milestone A / item 2). Two-user flow in the
// second test.
test.describe.configure({ timeout: 90_000 });

async function newUser(browser: Browser, prefix: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = uniqueEmail(prefix);
  await signIn(page, email);
  return { ctx, page, email };
}

async function openDeletePanel(page: import("@playwright/test").Page, workspaceName = "Personal") {
  await openWorkspaceMenu(page, workspaceName);
  await page.getByRole("menuitem", { name: "Account settings" }).click();
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
}

test("a solo user can delete their account and is returned to a fresh sign-in", async ({
  page,
}) => {
  const email = uniqueEmail("del");
  await signIn(page, email);
  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await openDeletePanel(page);

  const confirmBtn = page.getByRole("button", {
    name: "Permanently delete my account",
  });
  await expect(confirmBtn).toBeDisabled();
  await page.fill("#delete-confirm", "delete");
  await confirmBtn.click();

  await expect(page.getByText("Your account has been deleted.")).toBeVisible({
    timeout: 20000,
  });

  // Signing in with the same address now creates a brand-new account — the onboarding wall
  // (only shown to accounts with a null profiles.onboarded_at) is proof the old one is gone.
  await page.goto("/");
  await page.locator("#identifier").click();
  await page.locator("#identifier").pressSequentially(email, { delay: 20 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.click('button:has-text("Email me a sign-in link instead")');
  await page.waitForSelector("text=Check", { timeout: 15000 });
  const link = await getLatestMagicLink(email);
  await page.goto(link);
  await expect(page.getByTestId("onboarding")).toBeVisible({ timeout: 15000 });
});

test("deleting is blocked while you solely own a shared workspace", async ({
  browser,
}) => {
  const a = await newUser(browser, "del-a");
  const b = await newUser(browser, "del-b");

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

  // A: deletion is blocked.
  await openDeletePanel(a.page, "Shared workspace");
  await a.page.fill("#delete-confirm", "delete");
  await a.page
    .getByRole("button", { name: "Permanently delete my account" })
    .click();
  await expect(a.page.getByText(/still own.*Shared workspace/i)).toBeVisible({
    timeout: 15000,
  });
  // The account still exists — the modal is still open on the delete panel, not signed out.
  await expect(
    a.page.getByRole("button", { name: "Permanently delete my account" }),
  ).toBeVisible();

  await a.ctx.close();
  await b.ctx.close();
});
