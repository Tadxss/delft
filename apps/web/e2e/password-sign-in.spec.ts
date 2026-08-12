import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("a user can set a password from /account and sign in with it afterward", async ({ page }) => {
  const email = uniqueEmail("pw");
  await signIn(page, email);

  await page.click('a:has-text("Account")');
  await expect(page).toHaveURL(/\/account$/);
  await page.fill("#password", "correct-horse-battery");
  await page.fill("#confirm", "correct-horse-battery");
  await page.click('button:has-text("Save password")');
  await expect(page.getByText("Password saved.")).toBeVisible({ timeout: 10000 });

  await page.click('a:has-text("Back")');
  await expect(page).toHaveURL(/\/workspace$/);
  await page.click('button:has-text("Sign out")');
  await expect(page).toHaveURL("http://127.0.0.1:3000/");

  await page.fill('input[type="email"]', email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.fill("#password", "correct-horse-battery");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 });
});
