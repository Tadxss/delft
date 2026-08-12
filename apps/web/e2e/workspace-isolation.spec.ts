import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

// The core RLS promise this project is built on: every workspace (and everything inside it) is
// invisible to every other signed-in user, not just filtered out of the UI. Uses two fully
// separate browser contexts (separate cookies/localStorage) to simulate two real accounts, per
// votero's e2e convention of never sharing a context between simulated users.
test("user B never sees user A's workspace, even by guessing the workspace URL", async ({ browser }) => {
  const pageA = await (await browser.newContext()).newPage();
  await signIn(pageA, uniqueEmail("isolation-a"));
  await pageA.fill("#workspace-name", "A's private workspace");
  await pageA.click('button:has-text("Create")');
  await pageA.waitForURL(/\/workspace\/[^/]+--[^/]+$/, { timeout: 15000 });
  const workspaceASlug = new URL(pageA.url()).pathname.split("/").pop()!;

  const pageB = await (await browser.newContext()).newPage();
  await signIn(pageB, uniqueEmail("isolation-b"));

  // B's own workspace switcher must not list A's workspace.
  await expect(pageB.getByText("A's private workspace")).not.toBeVisible();
  await expect(pageB.getByText("No workspaces yet")).toBeVisible();

  // Navigating directly to A's workspace URL (full slug, exactly as a copy-pasted link would be)
  // must not reveal A's pages (RLS returns zero rows, not an error — the sidebar just renders
  // empty, which is the correct "nothing to see here").
  await pageB.goto(`/workspace/${workspaceASlug}`);
  await expect(pageB.getByText("No pages yet.")).toBeVisible();
  await expect(pageB.getByText("A's private workspace")).not.toBeVisible();
});
