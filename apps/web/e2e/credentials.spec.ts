import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("set up a vault, add a credential, and confirm it decrypts correctly after re-locking", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("credentials"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await page.click('a:has-text("Credentials")');
  await expect(page).toHaveURL(/\/credentials$/);

  // First visit — no vault_salt yet, so this is the "set up" form.
  await page.fill("#passphrase", "correct-horse-battery-staple");
  await page.fill("#confirm", "correct-horse-battery-staple");
  await page.click('button:has-text("Create vault")');

  // Add a credential with every field filled in.
  await page.click('button[aria-label="New credential"]');
  await page.fill("#title", "Example Site");
  await page.fill("#url", "https://example.com");
  await page.fill("#username", "alice");
  await page.fill("#password", "s3cret-p4ss");
  await page.fill("#notes", "Backup codes: 111222, 333444");
  await page.click('button:has-text("Save")');

  // Should land back in view mode showing the plaintext title and masked password.
  await expect(page.getByRole("heading", { name: "Example Site" })).toBeVisible();
  await expect(page.getByText("alice")).toBeVisible();

  // Reveal the password.
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText("s3cret-p4ss")).toBeVisible();
  await expect(page.getByText("Backup codes: 111222, 333444")).toBeVisible();

  // Lock the vault, then reload — the derived key is in-memory only, so this must re-prompt.
  await page.click('button:has-text("Lock vault")');
  await expect(page.locator("#passphrase")).toBeVisible();
  await page.reload();
  await expect(page.locator("#passphrase")).toBeVisible();

  // Unlock again (vault_salt now exists — this is the "enter passphrase" form, no confirm field).
  await expect(page.locator("#confirm")).toHaveCount(0);
  await page.fill("#passphrase", "correct-horse-battery-staple");
  await page.click('button:has-text("Unlock")');

  // The credential list is title/url plaintext (no decryption needed to render it)...
  await page.click('button:has-text("Example Site")');
  // ...but opening it decrypts secret_ciphertext with the freshly re-derived key.
  await expect(page.getByRole("heading", { name: "Example Site" })).toBeVisible();
  await expect(page.getByText("alice")).toBeVisible();
});

test("wrong vault passphrase surfaces a decrypt error instead of garbage data", async ({ page }) => {
  await signIn(page, uniqueEmail("credentials-wrong-pass"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await page.click('a:has-text("Credentials")');
  await page.fill("#passphrase", "the-real-passphrase");
  await page.fill("#confirm", "the-real-passphrase");
  await page.click('button:has-text("Create vault")');

  await page.click('button[aria-label="New credential"]');
  await page.fill("#title", "Example Site");
  await page.fill("#username", "alice");
  await page.fill("#password", "s3cret-p4ss");
  await page.click('button:has-text("Save")');
  await expect(page.getByRole("heading", { name: "Example Site" })).toBeVisible();

  await page.click('button:has-text("Lock vault")');
  await page.fill("#passphrase", "a-completely-different-passphrase");
  await page.click('button:has-text("Unlock")');
  await page.click('button:has-text("Example Site")');

  await expect(page.getByText("Couldn't decrypt")).toBeVisible();
});
