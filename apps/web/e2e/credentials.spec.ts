import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("set up a vault, add a credential, and confirm it re-prompts every time the modal reopens", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("credentials"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await page.getByRole("button", { name: "Credentials" }).click();
  await expect(page.getByText("Set up this workspace's vault")).toBeVisible();

  // First open — no vault_salt yet, so this is the "set up" form.
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
  await expect(
    page.getByRole("heading", { name: "Example Site" }),
  ).toBeVisible();
  await expect(page.getByText("alice")).toBeVisible();

  // Reveal the password.
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText("s3cret-p4ss")).toBeVisible();
  await expect(page.getByText("Backup codes: 111222, 333444")).toBeVisible();

  // Close the modal — this must lock the vault (discard the in-memory key), not just hide the UI.
  await page.click('button[aria-label="Close"]');
  await expect(
    page.getByText("Set up this workspace's vault"),
  ).not.toBeVisible();

  // Reopen — since it always re-prompts on open (no "unlock once per session" behavior), this must
  // show the unlock form again immediately, with no memory of the just-created vault key.
  await page.getByRole("button", { name: "Credentials" }).click();
  await expect(page.locator("#passphrase")).toBeVisible();
  await expect(page.locator("#confirm")).toHaveCount(0); // vault_salt now exists — "enter passphrase" form
  await page.fill("#passphrase", "correct-horse-battery-staple");
  await page.click('button:has-text("Unlock")');

  // The credential list is title/url plaintext (no decryption needed to render it)...
  await page.click('button:has-text("Example Site")');
  // ...but opening it decrypts secret_ciphertext with the freshly re-derived key.
  await expect(
    page.getByRole("heading", { name: "Example Site" }),
  ).toBeVisible();
  await expect(page.getByText("alice")).toBeVisible();
});

test("wrong vault passphrase is rejected at the unlock form, not after reaching the credential list", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("credentials-wrong-pass"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await page.getByRole("button", { name: "Credentials" }).click();
  await page.fill("#passphrase", "the-real-passphrase");
  await page.fill("#confirm", "the-real-passphrase");
  await page.click('button:has-text("Create vault")');

  await page.click('button[aria-label="New credential"]');
  await page.fill("#title", "Example Site");
  await page.fill("#username", "alice");
  await page.fill("#password", "s3cret-p4ss");
  await page.click('button:has-text("Save")');
  await expect(
    page.getByRole("heading", { name: "Example Site" }),
  ).toBeVisible();

  await page.click('button[aria-label="Close"]');
  await page.getByRole("button", { name: "Credentials" }).click();
  await page.fill("#passphrase", "a-completely-different-passphrase");
  await page.click('button:has-text("Unlock")');

  // Rejected at the unlock form itself — never reaches the credential list, since the wrong
  // passphrase is now verified (by test-decrypting an existing credential) before the vault is
  // ever marked unlocked, not just discovered later when opening a specific entry.
  await expect(
    page.getByText("Wrong passphrase — please try again."),
  ).toBeVisible();
  await expect(page.locator("#passphrase")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Example Site" }),
  ).not.toBeVisible();

  // The correct passphrase still works right after a failed attempt.
  await page.fill("#passphrase", "the-real-passphrase");
  await page.click('button:has-text("Unlock")');
  await page.click('button:has-text("Example Site")');
  await expect(
    page.getByRole("heading", { name: "Example Site" }),
  ).toBeVisible();
  await expect(page.getByText("alice")).toBeVisible();
});

test("an API key credential shows only the API Key field, not Username/Password", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("credentials-api-key"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await page.getByRole("button", { name: "Credentials" }).click();
  await page.fill("#passphrase", "correct-horse-battery-staple");
  await page.fill("#confirm", "correct-horse-battery-staple");
  await page.click('button:has-text("Create vault")');

  await page.click('button[aria-label="New credential"]');
  await page.getByRole("radio", { name: "API Key" }).click();
  // Switching type away from the default "Login" must swap the field set, not just add to it.
  await expect(page.locator("#username")).toHaveCount(0);
  await expect(page.locator("#password")).toHaveCount(0);
  await page.fill("#title", "Delft Project Token");
  await page.fill("#apiKey", "sk_live_abcdef123456");
  await page.click('button:has-text("Save")');

  // View mode shows the API Key label/value, not Username/Password.
  await expect(
    page.getByRole("heading", { name: "Delft Project Token" }),
  ).toBeVisible();
  // Scoped to a <span> — "API Key" also appears as the type-filter chip's button label elsewhere
  // on this page, which a plain getByText("API Key") would ambiguously match too.
  await expect(page.locator("span", { hasText: "API Key" })).toBeVisible();
  await expect(page.getByText("Username")).not.toBeVisible();
  await expect(page.getByText("Password")).not.toBeVisible();
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText("sk_live_abcdef123456")).toBeVisible();

  // Round-trips through a reload + re-unlock, same as the plaintext-username case above.
  await page.click('button[aria-label="Close"]');
  await page.getByRole("button", { name: "Credentials" }).click();
  await page.fill("#passphrase", "correct-horse-battery-staple");
  await page.click('button:has-text("Unlock")');
  await page.click('button:has-text("Delft Project Token")');
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText("sk_live_abcdef123456")).toBeVisible();
});

test("wrong passphrase is rejected even on a brand-new vault with zero credentials", async ({
  page,
}) => {
  // Regression test: a vault created with no credentials in it used to have nothing to verify a
  // passphrase against, so any passphrase (right or wrong) got in. Setup now also saves an
  // encrypted verifier (independent of any credential), so this must be rejected immediately too.
  await signIn(page, uniqueEmail("credentials-empty-vault"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await page.getByRole("button", { name: "Credentials" }).click();
  await page.fill("#passphrase", "the-real-passphrase");
  await page.fill("#confirm", "the-real-passphrase");
  await page.click('button:has-text("Create vault")');
  // "Select a credential" (the empty-detail-pane placeholder) is desktop-only — below `md`,
  // CredentialsModal shows the (empty) list directly instead of a side-by-side placeholder pane,
  // so it's never rendered there at all. The search input is the viewport-agnostic signal of "the
  // vault is unlocked and showing the credential list" this test actually cares about.
  await expect(page.locator('input[type="search"]')).toBeVisible();

  // Close without ever adding a credential, then try to unlock with the wrong passphrase.
  await page.click('button[aria-label="Close"]');
  await page.getByRole("button", { name: "Credentials" }).click();
  await page.fill("#passphrase", "a-completely-different-passphrase");
  await page.click('button:has-text("Unlock")');

  await expect(
    page.getByText("Wrong passphrase — please try again."),
  ).toBeVisible();
  await expect(page.locator('input[type="search"]')).not.toBeVisible();

  // The correct passphrase still works.
  await page.fill("#passphrase", "the-real-passphrase");
  await page.click('button:has-text("Unlock")');
  await expect(page.locator('input[type="search"]')).toBeVisible();
});
