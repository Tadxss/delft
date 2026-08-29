import { test, expect, type Page } from "@playwright/test";
import {
  onlyVisible,
  openSidebar,
  openWorkspaceMenu,
  signIn,
  uniqueEmail,
} from "./helpers";

// A minimal valid 1x1 PNG, base64-encoded — same fixture pattern as profile.spec.ts; enough for
// browser-image-compression to accept and process without a real file on disk.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

// The workspace-name button's accessible name is "<initials> <name>" (the initials badge is inside
// it), so match on a substring of the name rather than exact.
function workspaceButton(page: Page, nameFragment: string) {
  return onlyVisible(
    page.getByRole("button", { name: new RegExp(nameFragment) }),
  );
}

async function openWorkspaceSettings(page: Page, nameFragment: string) {
  await openWorkspaceMenu(page, nameFragment);
  await page.getByRole("menuitem", { name: "Workspace settings" }).click();
  await expect(page.getByText("Workspace settings")).toBeVisible();
}

test("workspace settings: rename and logo persist", async ({ page }) => {
  await signIn(page, uniqueEmail("workspace-settings"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  // --- rename ---
  await openWorkspaceSettings(page, "Personal");
  await page.fill("#workspace-settings-name", "Renamed Space");
  // Two "Save" buttons in the modal now (Name, Description) — the first is Name's.
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  // The URL slug refreshes to the new name; the id after "--" is unchanged.
  await page.waitForURL(/\/workspace\/renamed-space--[^/]+$/, {
    timeout: 15000,
  });
  await page.reload();
  await openSidebar(page);
  await expect(workspaceButton(page, "Renamed Space")).toBeVisible();

  // --- logo via pasted URL (deterministic — writes straight to logo_url, no storage) ---
  await openWorkspaceSettings(page, "Renamed Space");
  await page
    .getByPlaceholder("…or paste an image URL")
    .fill("https://example.com/logo.png");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove" })).toBeVisible({
    timeout: 15000,
  });
  await page
    .getByRole("button", { name: "Close" })
    .click();
  await openSidebar(page);
  // The header badge is now an <img alt=""> instead of the initials text.
  await expect(
    onlyVisible(page.locator("nav img[alt='']")).first(),
  ).toBeVisible();

  // --- logo upload (file) ---
  await openWorkspaceSettings(page, "Renamed Space");
  await page.setInputFiles('input[type="file"]', {
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  });
  // Still shows "Remove" (a logo is set) after the upload round trip; reload to confirm persist.
  await expect(page.getByRole("button", { name: "Remove" })).toBeVisible({
    timeout: 15000,
  });
  await page.reload();
  await openSidebar(page);
  await expect(
    onlyVisible(page.locator("nav img[alt='']")).first(),
  ).toBeVisible();

  // --- Remove reverts the header badge to initials and survives a reload ---
  await openWorkspaceSettings(page, "Renamed Space");
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click();
  await page.reload();
  await openSidebar(page);
  await expect(onlyVisible(page.locator("nav img[alt='']"))).toHaveCount(0);
  // Badge fell back to initials — the workspace-name button reads "RS Renamed Space".
  await expect(workspaceButton(page, "RS Renamed Space")).toBeVisible();
});

test("workspace settings: description persists", async ({ page }) => {
  await signIn(page, uniqueEmail("workspace-description"));

  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  await openWorkspaceSettings(page, "Personal");
  await page.fill(
    "#workspace-settings-description",
    "Ops runbooks and scratch notes.",
  );
  // The description Save is the second "Save" in the modal (after the Name one).
  await page.getByRole("button", { name: "Save", exact: true }).nth(1).click();
  await page.getByRole("button", { name: "Close" }).click();

  await page.reload();
  await openWorkspaceSettings(page, "Personal");
  await expect(page.locator("#workspace-settings-description")).toHaveValue(
    "Ops runbooks and scratch notes.",
  );
});
