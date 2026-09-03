import { test, expect, type Browser } from "@playwright/test";
import { confirmRecoveryKey, openWorkspaceMenu, signIn, uniqueEmail } from "./helpers";

// Per-member vaults (Build Order step 92, PR 2). In one shared workspace, A and B each set up
// their OWN private vault — neither inherits the other's, and neither can see the other's
// credential rows (RLS is `user_id = auth.uid()`).
test.describe.configure({ timeout: 120_000 });

async function newUser(browser: Browser, prefix: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = uniqueEmail(prefix);
  await signIn(page, email);
  return { ctx, page, email };
}

async function setUpVaultAndAddCredential(
  page: import("@playwright/test").Page,
  passphrase: string,
  credentialTitle: string,
) {
  await openWorkspaceMenu(page, "Shared workspace");
  await page.getByRole("menuitem", { name: "Credentials Vault" }).click();
  // Every member gets the setup form the first time — they never land on someone else's vault.
  await expect(page.getByText("Set up your vault")).toBeVisible();
  await page.fill("#passphrase", passphrase);
  await page.fill("#confirm", passphrase);
  await page.click('button:has-text("Create vault")');
  await confirmRecoveryKey(page);

  await page.click('button[aria-label="New credential"]');
  await page.fill("#title", credentialTitle);
  await page.fill("#username", `${credentialTitle}-user`);
  await page.fill("#password", `${credentialTitle}-pass`);
  await page.click('button:has-text("Save")');
  await expect(page.getByRole("heading", { name: credentialTitle })).toBeVisible();
  await page.click('button[aria-label="Close"]');
}

test("each member has their own private vault, invisible to the other", async ({
  browser,
}) => {
  const a = await newUser(browser, "mv-a");
  const b = await newUser(browser, "mv-b");

  // A creates the workspace and invites B as an editor.
  await a.page.fill("#workspace-name", "Shared workspace");
  await a.page.click('button:has-text("Create")');
  await a.page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

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

  // A sets up their vault + a credential.
  await setUpVaultAndAddCredential(a.page, "alpha-alpha-alpha-1", "A Secret");

  // B opens the vault: they get the SETUP form — they did NOT inherit A's vault or see A's
  // credential. Then B sets up their own.
  await setUpVaultAndAddCredential(b.page, "bravo-bravo-bravo-2", "B Secret");

  // B's vault holds only B's credential.
  await b.page.reload();
  await openWorkspaceMenu(b.page, "Shared workspace");
  await b.page.getByRole("menuitem", { name: "Credentials Vault" }).click();
  await b.page.fill("#passphrase", "bravo-bravo-bravo-2");
  await b.page.click('button:has-text("Unlock")');
  await expect(b.page.getByRole("button", { name: "B Secret" })).toBeVisible();
  await expect(b.page.getByRole("button", { name: "A Secret" })).toHaveCount(0);
  // B's passphrase is the only thing that opens B's vault.
  await b.page.click('button[aria-label="Close"]');

  // A's vault still holds only A's credential — B's never leaked in.
  await a.page.reload();
  await openWorkspaceMenu(a.page, "Shared workspace");
  await a.page.getByRole("menuitem", { name: "Credentials Vault" }).click();
  await a.page.fill("#passphrase", "alpha-alpha-alpha-1");
  await a.page.click('button:has-text("Unlock")');
  await expect(a.page.getByRole("button", { name: "A Secret" })).toBeVisible();
  await expect(a.page.getByRole("button", { name: "B Secret" })).toHaveCount(0);

  await a.ctx.close();
  await b.ctx.close();
});
