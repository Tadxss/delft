import { test, expect } from "@playwright/test";
import { onlyVisible, openSidebar, signIn, uniqueEmail } from "./helpers";

test("set a username, sign in with it, and confirm an unknown username is rejected without a password prompt", async ({
  page,
}) => {
  const email = uniqueEmail("usercheck");
  const username = `user${Date.now()}`.toLowerCase();
  await signIn(page, email);

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  // Set a username via the profile form.
  await openSidebar(page);
  await onlyVisible(
    page.getByRole("button", { name: "Account settings" }),
  ).click();
  await page
    .getByRole("button", { name: "Update profile", exact: true })
    .click();
  await page.fill("#username", username);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible({
    timeout: 10000,
  });

  // Set a password too, so we can actually sign in with it.
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Password", exact: true }).click();
  await page.fill("#password", "Correct-Horse-Battery9");
  await page.fill("#confirm", "Correct-Horse-Battery9");
  await page.click('button:has-text("Save password")');
  await expect(page.getByText("Password saved.")).toBeVisible({
    timeout: 10000,
  });

  await page.getByRole("button", { name: "Back" }).click();
  await page.click('button:has-text("Sign out")');
  await expect(page).toHaveURL("http://127.0.0.1:3000/");

  // Unknown username is rejected right at the identifier step — never advances to a password
  // prompt, since there's no email to send a magic link to either in that case.
  await page.fill("#identifier", "definitely-not-a-real-username");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("No account found with that username."),
  ).toBeVisible({
    timeout: 10000,
  });
  await expect(page.locator("#password")).toHaveCount(0);

  // Sign in via username — resolves to the real email (shown on the password step) and signs in.
  await page.fill("#identifier", username);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText(email)).toBeVisible({ timeout: 10000 });
  await page.fill("#password", "Correct-Horse-Battery9");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 });
});
