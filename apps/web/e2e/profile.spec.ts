import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

// A minimal valid 1x1 PNG, base64-encoded — enough for browser-image-compression to accept and
// process without needing a real file on disk.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("profile form: name/occupation/bio persist, avatar uploads and overwrites in place", async ({
  page,
}) => {
  const email = uniqueEmail("profile");
  await signIn(page, email);

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await page.getByRole("button", { name: "Account settings" }).click();
  await page.getByRole("button", { name: "Update profile", exact: true }).click();

  await page.fill("#firstName", "Ada");
  await page.fill("#middleName", "Byron");
  await page.fill("#lastName", "Lovelace");
  await page.selectOption("#occupation", "Software Engineer / Developer");
  await page.fill("#bio", "Wrote the first algorithm.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible({ timeout: 10000 });

  // Close and reopen the modal — confirm the save actually persisted, not just local state.
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Account settings" }).click();
  await page.getByRole("button", { name: "Update profile", exact: true }).click();
  await expect(page.locator("#firstName")).toHaveValue("Ada");
  await expect(page.locator("#middleName")).toHaveValue("Byron");
  await expect(page.locator("#lastName")).toHaveValue("Lovelace");
  await expect(page.locator("#occupation")).toHaveValue("Software Engineer / Developer");
  await expect(page.locator("#bio")).toHaveValue("Wrote the first algorithm.");

  // "Other" occupation reveals a free-text field whose value is what actually gets saved.
  await page.selectOption("#occupation", "Other");
  const customInput = page.locator('input[placeholder="Enter your occupation"]');
  await customInput.fill("Time Traveler");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Account settings" }).click();
  await page.getByRole("button", { name: "Update profile", exact: true }).click();
  await expect(page.locator("#occupation")).toHaveValue("Other");
  await expect(customInput).toHaveValue("Time Traveler");

  // Avatar upload.
  await page.setInputFiles('input[type="file"]', {
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  });
  const avatarImg = page.locator('img[alt=""]');
  await expect(avatarImg).toBeVisible({ timeout: 15000 });
  const src = await avatarImg.getAttribute("src");
  expect(src).toContain("/avatars/");

  // Re-upload — the fixed `{userId}/avatar.webp` path (app-side upsert:true) must overwrite the
  // same Storage object in place, not accumulate a new one per upload.
  await page.setInputFiles('input[type="file"]', {
    name: "avatar2.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  });
  await page.waitForTimeout(1500);
  const src2 = await avatarImg.getAttribute("src");
  expect(src2?.split("?")[0]).toBe(src?.split("?")[0]);
});
