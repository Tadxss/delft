import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("a user can set a password from the Account modal and sign in with it afterward", async ({ page }) => {
  const email = uniqueEmail("pw");
  await signIn(page, email);

  await page.getByRole("button", { name: "Account settings" }).click();
  await page.getByRole("button", { name: "Password", exact: true }).click();
  await page.fill("#password", "correct-horse-battery");
  await page.fill("#confirm", "correct-horse-battery");
  await page.click('button:has-text("Save password")');
  await expect(page.getByText("Password saved.")).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "Back" }).click();
  await page.click('button:has-text("Sign out")');
  await expect(page).toHaveURL("http://127.0.0.1:3000/");

  await page.fill('input[type="email"]', email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.fill("#password", "correct-horse-battery");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 });
});
