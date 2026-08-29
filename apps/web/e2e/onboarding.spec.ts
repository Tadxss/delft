import { test, expect } from "@playwright/test";
import { openWorkspaceMenu, signIn, uniqueEmail } from "./helpers";

test("first-login onboarding: mandatory 5-step stepper, gates required fields, persists, and doesn't reappear", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("onboarding"), { onboarding: "leave" });

  const card = page.getByTestId("onboarding");
  const next = card.getByRole("button", { name: "Next", exact: true });
  const back = card.getByRole("button", { name: "Back", exact: true });
  const finish = card.getByRole("button", { name: "Finish", exact: true });

  // Lands on the stepper, not the workspace picker.
  await expect(card).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspaces" })).toHaveCount(0);

  // Step 1 — name. Next is blocked until first + last are both filled.
  await expect(card.getByRole("heading", { name: "What's your name?" })).toBeVisible();
  await expect(next).toBeDisabled();
  await card.locator("#onboarding-first-name").fill("Ada");
  await expect(next).toBeDisabled();
  await card.locator("#onboarding-last-name").fill("Lovelace");
  await expect(next).toBeEnabled();
  await next.click();

  // Step 2 — occupation. Blocked until one is chosen.
  await expect(card.getByRole("heading", { name: "What do you do?" })).toBeVisible();
  await expect(next).toBeDisabled();
  await card
    .locator("#onboarding-occupation")
    .selectOption({ label: "Data Scientist / Analyst" });
  await expect(next).toBeEnabled();
  await next.click();

  // Step 3 — company (optional): Next is enabled with the field empty.
  await expect(card.getByRole("heading", { name: "Where do you work?" })).toBeVisible();
  await expect(next).toBeEnabled();
  await card.locator("#onboarding-company").fill("Analytical Engines Ltd");
  await next.click();

  // Step 4 — bio (optional). Back returns to step 3 with the company value preserved.
  await expect(card.getByRole("heading", { name: "A short bio" })).toBeVisible();
  await expect(next).toBeEnabled();
  await back.click();
  await expect(card.locator("#onboarding-company")).toHaveValue(
    "Analytical Engines Ltd",
  );
  await next.click();
  await next.click();

  // Step 5 — usage. Finish blocked until at least one box is checked.
  await expect(
    card.getByRole("heading", { name: "How will you use CrowScribe?" }),
  ).toBeVisible();
  await expect(finish).toBeDisabled();
  await card.getByRole("checkbox", { name: "Work & productivity" }).click();
  await expect(finish).toBeEnabled();
  await finish.click();

  // Onboarding done → workspace picker, and it does not come back on reload.
  await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible({
    timeout: 15000,
  });
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByTestId("onboarding")).toHaveCount(0);

  // Values round-tripped into the profile form.
  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });
  await openWorkspaceMenu(page);
  await page.getByRole("menuitem", { name: "Account settings" }).click();
  await page
    .getByRole("button", { name: "Update profile", exact: true })
    .click();
  await expect(page.locator("#firstName")).toHaveValue("Ada");
  await expect(page.locator("#lastName")).toHaveValue("Lovelace");
  await expect(page.locator("#occupation")).toHaveValue("Data Scientist / Analyst");
  await expect(page.locator("#company")).toHaveValue("Analytical Engines Ltd");
  await expect(
    page.getByRole("checkbox", { name: "Work & productivity" }),
  ).toHaveAttribute("aria-checked", "true");
});
