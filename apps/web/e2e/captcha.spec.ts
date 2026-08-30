import { test, expect } from "@playwright/test";
import { uniqueEmail } from "./helpers";

// Cloudflare Turnstile on the login page (Milestone C / step 87). Local + CI run with Turnstile's
// always-pass TEST site key, so the widget auto-solves — this asserts it's present and that it
// gates the auth buttons until it does.

test("the Turnstile widget renders on the password step and gates sign-in", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#identifier").click();
  await page
    .locator("#identifier")
    .pressSequentially(uniqueEmail("captcha"), { delay: 20 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  const magicLinkBtn = page.getByRole("button", {
    name: "Email me a sign-in link instead",
  });
  // Gated until the captcha resolves...
  await expect(magicLinkBtn).toBeDisabled();
  // ...then the always-pass test widget auto-solves and enables it.
  await expect(magicLinkBtn).toBeEnabled({ timeout: 20000 });
  // The Turnstile script loaded from Cloudflare.
  expect(
    await page.evaluate(() => typeof (window as unknown as { turnstile?: unknown }).turnstile),
  ).toBe("object");
});
