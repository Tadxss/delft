import type { Locator, Page } from "@playwright/test";

const MAILPIT_URL = "http://127.0.0.1:54324";

interface MailpitMessage {
  ID: string;
  To: { Address: string }[];
}
interface MailpitListResponse {
  messages: MailpitMessage[];
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

// Delft uses magic-link email (not an OTP code like votero) — the emailed message contains a
// GoTrue `/auth/v1/verify?token=...&type=magiclink&redirect_to=...` URL, which is what we
// navigate to directly. It's long enough that Mailpit's list-view `Snippet` preview can truncate
// it, so this fetches each candidate message's full body via the single-message endpoint instead
// of relying on the list response.
export async function getLatestMagicLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=10`);
    const list = (await listRes.json()) as MailpitListResponse;
    const msg = list.messages.find((m) => m.To?.[0]?.Address === email);
    if (msg) {
      const fullRes = await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`);
      const full = (await fullRes.json()) as { Text: string };
      const match = full.Text.match(
        /http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify\?[^\s)]+/,
      );
      if (match) return match[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No magic-link email found for ${email}`);
}

// Fills the mandatory first-login onboarding stepper with minimal valid data and lands on the
// workspace picker. A no-op if the stepper isn't showing (existing account). Called by signIn so
// every spec sails through the wall transparently; the dedicated onboarding.spec.ts opts out with
// `signIn(page, email, { onboarding: "leave" })` and drives the UI itself.
export async function completeOnboarding(page: Page): Promise<void> {
  const card = page.getByTestId("onboarding");
  const showing = await card
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (!showing) return;

  const next = card.getByRole("button", { name: "Next", exact: true });

  await card.locator("#onboarding-first-name").fill("Test");
  await card.locator("#onboarding-last-name").fill("User");
  await next.click();

  await card
    .locator("#onboarding-occupation")
    .selectOption({ label: "Software Engineer / Developer" });
  await next.click(); // occupation → company
  await next.click(); // company → bio
  await next.click(); // bio → usage

  await card.getByRole("checkbox", { name: "Work & productivity" }).click();
  await card.getByRole("button", { name: "Finish" }).click();
  await page.waitForURL(/\/workspace(\/|$)/, { timeout: 15000 });
}

export async function signIn(
  page: Page,
  email: string,
  opts: { onboarding?: "complete" | "leave" } = {},
): Promise<void> {
  await page.goto("/");
  // Real bug found via WebKit e2e coverage (BETA_READINESS.md item 5): `page.fill()` sets the DOM
  // value and returns immediately, with no wait for React to actually attach its hydration event
  // listeners. On WebKit specifically, `goto()`'s "load" event reliably resolves before hydration
  // finishes, so an instant fill() lands *before* React attaches, then gets silently wiped when
  // the controlled `<input value={identifierInput}>` hydrates against its still-empty initial
  // state — Chromium's timing didn't expose this, but it's a genuine hydration race, not a
  // browser quirk to route around. `click()` + `pressSequentially()` mimics real per-keystroke
  // typing instead, which both fixes the race (each keystroke lands well after hydration
  // completes) and is closer to real usage than an instant fill.
  await page.locator("#identifier").click();
  await page.locator("#identifier").pressSequentially(email, { delay: 20 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.click('button:has-text("Email me a sign-in link instead")');
  await page.waitForSelector("text=Check", { timeout: 15000 });
  const link = await getLatestMagicLink(email);
  await page.goto(link);
  await page.waitForURL(/\/w/, { timeout: 15000 });
  if (opts.onboarding !== "leave") await completeOnboarding(page);
}

// Below `md`, Sidebar.tsx's contents live behind an off-canvas drawer (see
// docs/ARCHITECTURE.md Build Order step 31) rather than being always-visible — this toggle only
// renders at all below that breakpoint (`md:hidden` on the button itself), so it's a safe no-op to
// call unconditionally on every project, including the desktop-viewport chromium/webkit ones where
// it's never present. The drawer also auto-closes on navigation, so callers need to call this again
// after any nav, not just once per test.
//
// Deliberately does NOT gate the *closed → open* path on `toggle.isVisible()` — that's an instant,
// non-retrying check, and immediately after a fresh `goto()`/`reload()` the page may not have
// settled yet (the same category of race `signIn()` above works around), so a same-tick visibility
// check can miss a toggle that's about to render. `viewportSize()` is synchronous, known from
// context config before any content loads, and exactly matches the `md` breakpoint this toggle is
// gated on — no race possible. `.click()` itself still auto-waits for the toggle to be actionable.
//
// It DOES short-circuit when the drawer is already open: it stays open until the next navigation,
// so a second call in the same test (e.g. reopening a modal that lives in the sidebar) would just
// click the now-backdrop-covered toggle and hang. The in-drawer "Collapse sidebar" button is only
// visible when the drawer is open (below `md` the always-mounted desktop `<Sidebar>` copy is
// `display:none`), so it's a safe tell.
export async function openSidebar(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width >= 768) return;
  const alreadyOpen = await page
    .getByRole("button", { name: "Collapse sidebar" })
    .isVisible()
    .catch(() => false);
  if (alreadyOpen) return;
  await page.getByRole("button", { name: "Open sidebar" }).click();
}

// Credentials Vault, Account settings, and Workspace settings all live in the sidebar's
// workspace-name dropdown menu now (no standalone icon row). Open the sidebar (mobile drawer
// no-op on desktop), then click the workspace-name button to open the menu. The menu closes on
// navigation and on outside click, so callers re-open it per use like `openSidebar`.
export async function openWorkspaceMenu(
  page: Page,
  workspaceName = "Personal",
): Promise<void> {
  await openSidebar(page);
  await onlyVisible(
    page.getByRole("button", { name: new RegExp(workspaceName) }),
  ).click();
}

// Below `md`, CredentialsModal shows one pane at a time (list, or the selected credential's detail
// with a "← Back" row) rather than side-by-side — this button only renders at all below that
// breakpoint, so it's a safe no-op on desktop-viewport projects. Needed before any assertion/action
// against the credential *list* (search box, a folder/credential row) that follows a step which
// left a credential selected, since that's what switches the mobile view to the detail pane.
//
// Unlike `openSidebar` above, there's no purely-structural "should this exist" signal to check
// instead (it depends on selection state, not just viewport) — a bounded `waitFor` stands in for
// the instant `isVisible()` check that would otherwise race a state change that only just
// happened, while still resolving quickly (not the full default timeout) when the button
// genuinely never renders (desktop viewport, or nothing was selected to begin with).
export async function backToList(page: Page): Promise<void> {
  const backButton = page.getByRole("button", { name: "Back" });
  const appeared = await backButton
    .waitFor({ state: "visible", timeout: 1000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) {
    await backButton.click();
  }
}

// Drags `source` onto `target` — used by both tree drag-and-drop specs (pages sidebar, credentials
// folder tree). Both trees' PointerSensor uses an activationConstraint of
// { delay: 200, tolerance: 8 } specifically so ordinary clicks on a row's Link/buttons aren't
// hijacked as drags, which means a plain Playwright dragTo() (a single instantaneous move) never
// satisfies the delay and the drag never activates. This mirrors real pointer behavior instead:
// press, hold in place past the delay so dnd-kit commits to a drag, then move to the target in
// steps so its collision detection (which runs on move, not just at drop) has a chance to register
// the target as "over" before releasing.
export async function dragElementOnto(
  page: Page,
  source: Locator,
  target: Locator,
): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("dragElementOnto: source or target has no bounding box");
  }

  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + sourceBox.height / 2;
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  // WebKit/mobile Safari need a longer, steadier hold than Chromium for dnd-kit's PointerSensor to
  // reliably register activation past the 200ms delay constraint (see CredentialList.tsx/
  // Sidebar.tsx) — 300ms was enough on Chromium but flaky there.
  await page.waitForTimeout(500);
  await page.mouse.move(targetX, targetY, { steps: 20 });
  await page.waitForTimeout(200);
  await page.mouse.move(targetX, targetY);
  await page.waitForTimeout(200);
  await page.mouse.up();
}

// Locates a ReorderStrip's hit-area div immediately before/after a given row — used to test
// drag-to-reorder (Sidebar/PageTreeNode, CredentialList/CredentialFolderTreeNode). `rowDescendant`
// is any element *inside* the row (its Link/button), not the row's own <li> — ReorderStrip.tsx
// always renders as a sibling <li> immediately before/after the row's <li> within the same parent
// <ul>, so xpath sibling traversal finds it without the test needing to know its internal id
// (which encodes an adjacent sibling's uuid, not something a test can predict cleanly).
export function reorderStripBefore(rowDescendant: Locator): Locator {
  return rowDescendant
    .locator("xpath=ancestor::li[1]/preceding-sibling::li[1]")
    .locator("div")
    .first();
}

export function reorderStripAfter(rowDescendant: Locator): Locator {
  return rowDescendant
    .locator("xpath=ancestor::li[1]/following-sibling::li[1]")
    .locator("div")
    .first();
}

// Sidebar content exists twice in the DOM on mobile viewports whenever the drawer is open — a
// CSS-hidden desktop copy (SidebarShell.tsx's `hidden md:flex` wrapper) plus the visible drawer
// copy, both backed by the same `Sidebar` component instance-for-instance. A bare role/text locator
// matches both, so `.click()`/assertions default to the first (hidden) one in DOM order and hang.
// `.and()` intersects with Playwright's `:visible` pseudo-class to narrow down to the one a user
// could actually see — a no-op on desktop viewports/projects where only one copy ever exists.
export function onlyVisible(locator: Locator): Locator {
  return locator.and(locator.page().locator(":visible"));
}
