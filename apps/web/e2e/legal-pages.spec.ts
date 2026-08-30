import { test, expect } from "@playwright/test";

// The public legal routes (Milestone A / production-readiness item 1). These must stay reachable
// without auth and stay linked from the login page — Google OAuth's data policy and our
// providers' ToS all require a published Privacy Policy.

test("privacy, terms, and contact pages load without auth", async ({ page }) => {
  for (const [path, heading] of [
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms of Service"],
    ["/contact", "Contact"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    // Every legal page links back home in its footer.
    await expect(
      page.getByRole("link", { name: "Home", exact: true }),
    ).toBeVisible();
  }
});

test("the login page links to the Terms and Privacy Policy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
});
