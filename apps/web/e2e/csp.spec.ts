import { test, expect } from "@playwright/test";
import { openSidebar, openWorkspaceMenu, signIn, uniqueEmail } from "./helpers";

// Content-Security-Policy (Milestone B item 10, enforcing as of Milestone C / step 87). Asserts
// the enforcing header is present and walks the heavy surfaces (BlockNote editor, Excalidraw
// canvas, credentials vault) — now real blocks, so any violation here means the app is broken,
// not just noisy.

test("the enforcing CSP header is present on public and app routes", async ({
  page,
}) => {
  for (const path of ["/", "/privacy"]) {
    const res = await page.goto(path);
    const headers = res?.headers() ?? {};
    expect(
      headers["content-security-policy-report-only"],
      `should be enforcing, not report-only, on ${path}`,
    ).toBeUndefined();
    const csp = headers["content-security-policy"];
    expect(csp, `CSP header on ${path}`).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
  }
});

test("no CSP violations across the editor, canvas, and vault", async ({
  page,
}) => {
  // Ignore WebKit's advisory noise; count only real blocks. `/_vercel/` (Vercel Analytics +
  // Speed Insights) scripts are served only by Vercel's edge — under `next start` in CI they
  // 404 as HTML and `nosniff` refuses to execute them, which is a CI-only artifact, not a CSP
  // problem the app has in production.
  const violations: string[] = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (
      /refused to|violates the following content security policy directive/i.test(
        t,
      ) &&
      !t.includes("/_vercel/")
    ) {
      violations.push(t);
    }
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
