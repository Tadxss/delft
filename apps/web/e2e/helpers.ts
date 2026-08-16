import type { Page } from "@playwright/test";

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
      const match = full.Text.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify\?[^\s)]+/);
      if (match) return match[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No magic-link email found for ${email}`);
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await page.fill("#identifier", email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.click('button:has-text("Email me a sign-in link instead")');
  await page.waitForSelector("text=Check", { timeout: 15000 });
  const link = await getLatestMagicLink(email);
  await page.goto(link);
  await page.waitForURL(/\/w/, { timeout: 15000 });
}
