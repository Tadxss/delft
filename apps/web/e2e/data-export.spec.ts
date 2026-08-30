import { test, expect } from "@playwright/test";
import {
  confirmRecoveryKey,
  openSidebar,
  openWorkspaceMenu,
  signIn,
  uniqueEmail,
} from "./helpers";

// Data export (Milestone C / item 13). "Account settings → Export my data" downloads a single
// JSON file with every workspace's pages, canvases, folders, and — for unlocked vaults —
// decrypted credentials.

test("exports pages, canvas, and the decrypted vault as one JSON file", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("export"));
  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  // A page with content
  await openSidebar(page);
  await page.click('button[aria-label="New page"]:visible');
  await page.waitForURL(/\/p\/[^/]+$/, { timeout: 15000 });
  await page.locator('input[placeholder="Untitled"]').fill("My export page");
  await page.locator('[contenteditable="true"]').first().click();
  await page.keyboard.type("Exported line of content.");
  await page.waitForTimeout(1200);

  // A canvas
  await openSidebar(page);
  await page.click('button[aria-label="New canvas"]:visible');
  await page.waitForURL(/\/canvas\/[^/]+$/, { timeout: 15000 });
  await page.locator('input[placeholder="Untitled"]').fill("My export canvas");
  await page.waitForTimeout(1200);

  // A vault + a credential (vault stays unlocked in memory for this session)
  await openWorkspaceMenu(page);
  await page.getByRole("menuitem", { name: "Credentials Vault" }).click();
  await page.fill("#passphrase", "correct-horse-battery-staple");
  await page.fill("#confirm", "correct-horse-battery-staple");
  await page.click('button:has-text("Create vault")');
  await confirmRecoveryKey(page);
  await page.click('button[aria-label="New credential"]');
  await page.fill("#title", "Exported Login");
  await page.fill("#username", "export-user");
  await page.fill("#password", "export-secret-42");
  await page.click('button:has-text("Save")');
  await expect(
    page.getByRole("heading", { name: "Exported Login" }),
  ).toBeVisible();
  await page.click('button[aria-label="Close"]');

  // Export
  await openWorkspaceMenu(page);
  await page.getByRole("menuitem", { name: "Account settings" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export my data" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^crowscribe-export-\d{4}-\d{2}-\d{2}\.json$/,
  );

  const fs = await import("node:fs/promises");
  const raw = await fs.readFile(await download.path(), "utf8");
  const data = JSON.parse(raw);

  const ws = data.workspaces.find((w: { name: string }) => w.name === "Personal");
  expect(ws).toBeTruthy();
  expect(ws.role).toBe("owner");
  expect(
    ws.pages.some((p: { title: string }) => p.title === "My export page"),
  ).toBe(true);
  expect(
    ws.canvases.some((c: { title: string }) => c.title === "My export canvas"),
  ).toBe(true);
  // The vault locks when the credentials modal closes, so the export carries the encrypted form
  // (always) + the workspace salt — enough to decrypt offline with the passphrase.
  const cred = ws.credentials.find(
    (c: { title: string }) => c.title === "Exported Login",
  );
  expect(cred.secretCiphertext).toBeTruthy();
  expect(cred.secretIv).toBeTruthy();
  expect(ws.vaultSalt).toBeTruthy();
});
