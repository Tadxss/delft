import { test, expect } from "@playwright/test";
import { openSidebar, openWorkspaceMenu, signIn, uniqueEmail } from "./helpers";

// Content-Security-Policy (Milestone B / item 10). Shipped report-only first — this spec both
// asserts the header is present and walks the heavy surfaces (BlockNote editor, Excalidraw
// canvas, credentials vault) collecting any CSP violation the browser reports, so the allowlist
// is validated against real usage before a follow-up flips it to enforcing.

test("the CSP report-only header is present on public and app routes", async ({
  page,
}) => {
  for (const path of ["/", "/privacy"]) {
    const res = await page.goto(path);
    const csp = res?.headers()["content-security-policy-report-only"];
    expect(csp, `CSP-Report-Only header on ${path}`).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
  }
});

test("no CSP violations across the editor, canvas, and vault", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (/content security policy|CSP/i.test(t)) violations.push(t);
  });

  await signIn(page, uniqueEmail("csp"));
  await page.fill("#workspace-name", "Personal");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });

  // Page editor
  await openSidebar(page);
  await page.click('button[aria-label="New page"]:visible');
  await page.waitForURL(/\/p\/[^/]+$/, { timeout: 15000 });
  await page.locator('[contenteditable="true"]').first().click();
  await page.keyboard.type("Hello CSP");
  await page.waitForTimeout(1200);

  // Canvas (Excalidraw — the worker-src / font-src edge case)
  await openSidebar(page);
  await page.click('button[aria-label="New canvas"]:visible');
  await page.waitForURL(/\/canvas\/[^/]+$/, { timeout: 15000 });
  await page.waitForTimeout(1500);

  // Credentials vault modal
  await openWorkspaceMenu(page);
  await page.getByRole("menuitem", { name: "Credentials Vault" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(500);

  expect(violations, violations.join("\n")).toEqual([]);
});
