import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

// The recovery key round trip end to end: setup shows it once and can't be skipped, a wrong
// recovery key is rejected, the correct one lets you set a brand-new passphrase, and every
// existing credential is still fully readable afterward — the whole point of the wrapped-key model
// (Build Order step 58) over the old "forgot passphrase = permanent data loss" behavior.
test("forgot passphrase recovers via the recovery key with zero data loss", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("vault-recovery"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await page.getByRole("button", { name: "Credentials" }).click();
  await page.fill("#passphrase", "the-original-passphrase");
  await page.fill("#confirm", "the-original-passphrase");
  await page.click('button:has-text("Create vault")');

  // Recovery key screen: Continue is disabled until the checkbox is checked, and the key itself is
  // rendered as plain text we can read back out for the recovery step below.
  await expect(page.getByText("Save your recovery key")).toBeVisible();
  const continueButton = page.getByRole("button", { name: "Continue" });
  await expect(continueButton).toBeDisabled();
  const recoveryKey = await page.locator("code").textContent();
  expect(recoveryKey).toBeTruthy();
  await page
    .getByRole("checkbox", { name: "I've saved this recovery key" })
    .check();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  // Add a credential to prove it survives the recovery round trip below.
  await page.click('button[aria-label="New credential"]');
  await page.fill("#title", "Example Site");
  await page.fill("#username", "alice");
  await page.fill("#password", "s3cret-p4ss");
  await page.click('button:has-text("Save")');
  await expect(
    page.getByRole("heading", { name: "Example Site" }),
  ).toBeVisible();

  // Lock and come back with the wrong passphrase.
  await page.click('button[aria-label="Close"]');
  await page.getByRole("button", { name: "Credentials" }).click();
  await page.fill("#passphrase", "not-the-real-passphrase");
  await page.click('button:has-text("Unlock")');
  await expect(
    page.getByText("Wrong passphrase — please try again."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Forgot passphrase?" }).click();
  await expect(page.getByText("Recover with your recovery key")).toBeVisible();

  // A wrong recovery key is rejected with a clear error, offering the last-resort path too.
  await page.fill(
    "input[placeholder='XXXXX-XXXXX-XXXXX-…']",
    "WRONG0-WRONG0-WRONG0-WRONG0-WRONG0-WRONG0-WRONG0-WRONG0-WRONG0-WRONG0-00",
  );
  await page.click('button:has-text("Continue")');
  await expect(page.getByText("That recovery key doesn't match")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Lost your recovery key too?" }),
  ).toBeVisible();

  // The real recovery key succeeds and prompts for a new passphrase.
  await page.fill("input[placeholder='XXXXX-XXXXX-XXXXX-…']", recoveryKey!);
  await page.click('button:has-text("Continue")');
  await expect(page.getByText("Choose a new passphrase")).toBeVisible();

  await page.fill(
    "input[placeholder='New vault passphrase']",
    "a-brand-new-passphrase",
  );
  await page.fill(
    "input[placeholder='Confirm new passphrase']",
    "a-brand-new-passphrase",
  );
  await page.click('button:has-text("Set new passphrase")');

  // Recovery unlocks straight into the credential list — the original credential is still there
  // and still decrypts correctly under the VMK, unchanged by the passphrase rotation.
  await page.click('button:has-text("Example Site")');
  await expect(
    page.getByRole("heading", { name: "Example Site" }),
  ).toBeVisible();
  await expect(page.getByText("alice")).toBeVisible();
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText("s3cret-p4ss")).toBeVisible();

  // Lock and confirm the NEW passphrase is what actually works now, not the original one.
  await page.click('button[aria-label="Close"]');
  await page.getByRole("button", { name: "Credentials" }).click();
  await page.fill("#passphrase", "the-original-passphrase");
  await page.click('button:has-text("Unlock")');
  await expect(
    page.getByText("Wrong passphrase — please try again."),
  ).toBeVisible();
  await page.fill("#passphrase", "a-brand-new-passphrase");
  await page.click('button:has-text("Unlock")');
  await page.click('button:has-text("Example Site")');
  await expect(
    page.getByRole("heading", { name: "Example Site" }),
  ).toBeVisible();
});
