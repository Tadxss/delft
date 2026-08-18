import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("a fresh user can sign in via magic link and lands on the workspace switcher", async ({
  page,
}) => {
  const email = uniqueEmail("sign-in");
  await signIn(page, email);

  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
  // The URL's #access_token fragment must be stripped once the session is detected — leaving it
  // behind would mean the token is silently sitting in browser history/referrer headers forever.
  expect(page.url()).not.toContain("access_token");
});

test("visiting an authenticated route while signed out redirects to the login screen", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(page).toHaveURL("http://127.0.0.1:3000/");
  await expect(
    page.getByText("Careful records. Quiet craft. One private place."),
  ).toBeVisible();
});
