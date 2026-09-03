# Testing

## Local prerequisites

```sh
npx supabase start   # boots local Postgres/Auth/Storage/Mailpit — requires Docker
pnpm dev --filter=web
```

Magic-link email is still the only way to _create_ an account. Locally, "sending an email" lands
in Mailpit, not a real inbox — open `http://127.0.0.1:54324` and click the link there. The e2e
suite does this same lookup programmatically via Mailpit's REST API (`e2e/helpers.ts`). Since
Build Order step 84 the magic-link email is a **custom branded template**
(`supabase/templates/magic_link.html`, wired via `[auth.email.template.magic_link]` in
`config.toml`) — so CI renders the real template, and `getLatestMagicLink` depends on the raw
`{{ .ConfirmationURL }}` staying present as visible text in the body (don't remove the "paste
this link" line). A full `supabase stop && supabase start` is needed to pick up template edits,
not `db reset`. A **fresh
sign-in now lands on a mandatory 5-step onboarding wall** (name/occupation/company/bio/usage —
Build Order step 78) before the workspace picker; `signIn` in `helpers.ts` auto-completes it with
minimal data unless a spec opts out with `signIn(page, email, { onboarding: "leave" })`. Once
signed in, the sidebar's workspace-name dropdown → "Account settings" opens the Account modal,
where a user can set a password, pick a theme, and update their profile
(name/occupation/company/bio/avatar/username — see Build Order steps 28-29 and 78; a set username
can be typed on the sign-in page instead of the email). The login page also offers "Continue with
Google" (a full-page redirect to Google in the current tab — `docs/ARCHITECTURE.md` Build Order
step 90, which reverted step 15's popup) — Google sign-in needs real OAuth credentials configured
(step 14) and isn't covered by the automated suite.

`supabase start` also boots the Edge runtime and serves `send-invitation-email`
(Build Order step 80) and `delete-account` (step 85). `send-invitation-email` no-ops without
`RESEND_API_KEY`, so the automated suite runs against it harmlessly; exercise the real path with
`npx supabase functions serve send-invitation-email --env-file supabase/functions/.env`.

**Turnstile / CAPTCHA (Build Order step 87):** the login page shows a Cloudflare Turnstile widget
only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set. Local `.env.local` and CI use Turnstile's
**always-pass test keys** — site `1x00000000000000000000AA` (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) +
secret `1x0000000000000000000000000000000AA` (`SUPABASE_AUTH_CAPTCHA_SECRET`, consumed by
`[auth.captcha]` in `config.toml`) — so the widget auto-solves and the `signIn` helper's button
click just auto-waits. Production uses the real Cloudflare-dashboard keys.

## Automated suite

`apps/web/e2e/*.spec.ts`, run via `pnpm --filter web test:e2e` (or `test:e2e:ui` for interactive
debugging of a single spec). Requires the local Supabase stack running and a fresh-enough
database — see "Resetting between runs" below if specs start colliding with leftover data (in
practice this is rare since every spec uses a freshly generated unique email per run).

Runs against three `playwright.config.ts` projects — `chromium` (`devices["Desktop Chrome"]`),
`webkit` (`devices["Desktop Safari"]`), and `mobile-safari` (`devices["iPhone 13"]`) — every spec on
all three, sequentially (`fullyParallel: false`). `webkit`/`mobile-safari` exist specifically to
catch real Safari/WebKit-engine quirks in three dependencies with known iOS Safari history:
`browser-image-compression` (WebP encode support), `@excalidraw/excalidraw` (touch/pointer-event
handling), and `@blocknote/mantine` (contentEditable/ProseMirror behavior) — see
`docs/ARCHITECTURE.md` Build Order steps 32-33. Run a single project with `npx playwright test
--project=webkit` (or `--project=chromium`/`--project=mobile-safari`) from `apps/web`.

Sidebar/credentials-modal content that only renders below the `md` breakpoint (the mobile drawer,
the credentials list/detail single-pane switch — see Build Order step 31) needs the spec to
explicitly open it first; `e2e/helpers.ts` exports `openSidebar(page)`, `openWorkspaceMenu(page,
name?)` (opens the workspace-name dropdown), `backToList(page)`, and `onlyVisible(locator)` for
this (the last one because the drawer's content coexists in the DOM with a CSS-hidden desktop
copy, so a bare role/text locator matches both). All are no-ops on the desktop `chromium`/`webkit`
projects, so existing specs don't need per-project branching — just call them at every point that
touches sidebar/credentials-list content, not only the first. Other exports: `uniqueEmail`,
`getLatestMagicLink`, `signIn(page, email, { onboarding })`, `completeOnboarding`,
`dragElementOnto`, `reorderStripBefore/After`.

| `e2e/*.spec.ts`               | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sign-in.spec.ts`             | Magic-link sign-in end-to-end (send → Mailpit → verify URL → landed signed in, URL fragment stripped); signed-out visitors get redirected off authenticated routes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `password-sign-in.spec.ts`    | Set a password from the Account modal, sign out, sign back in with email+password (no magic-link email round-trip).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `username-sign-in.spec.ts`    | Set a username from the Account modal's profile box, sign out, sign back in typing the _username_ instead of the email — confirms it resolves to the right account and signs in; a made-up username is rejected right at the identifier step, never reaching a password prompt.                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace-pages.spec.ts`     | Create workspace → create page → edit title + BlockNote content → autosave persists across a reload → nested sub-page creation and tree display; drag-and-drop reparenting (including back to root); drag-and-drop reordering of sibling pages, at both the root level and nested under a parent.                                                                                                                                                                                                                                                                                                                                                           |
| `publish-share.spec.ts`       | Publish toggle → `/share/[slug]` renders content read-only (zero `[contenteditable]` elements) to a fully separate signed-out browser context → unpublish takes the share URL back down to a 404.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `publish-share-canvas.spec.ts` | Canvas publish toggle → `/share/canvas/[slug]` renders the Excalidraw scene read-only (`viewModeEnabled` — no shape-tool toolbar) to a fully separate signed-out browser context → unpublish takes the share URL back down to a 404.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `onboarding.spec.ts`          | First-login stepper: a fresh sign-in lands on the mandatory 5-step onboarding (not the workspace picker); Next/Finish stay disabled until each step's required fields are filled (name, occupation, ≥1 usage checkbox); Back preserves entered values; Finish → workspace picker and it does not reappear on reload; the collected name/occupation/company/usage round-trip into the Account → Update profile form. Every other spec's `signIn` helper auto-completes this wall.                                                                                                                                                       |
| `workspace-isolation.spec.ts` | A second real user can neither see user A's workspace in their own switcher, nor read anything by navigating directly to user A's workspace URL — RLS-level isolation, not just UI filtering.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace-invitations.spec.ts` | Two-user flows: owner A invites B by email as **editor** → B accepts the pending invite from the picker → B (editor) creates a page in the shared workspace → A demotes B to **viewer** → B's editor goes read-only (`[contenteditable="false"]`, no "New page"); B **does** see "Credentials Vault" (their own private vault — step 92) but **not** "Members" (owner-only) → A removes B → B loses access (RLS zero rows). Plus a `@username` invite accepted via the `/invite/[token]` link.                                                                                                                                                                              |
| `credentials.spec.ts`         | Opens the Credentials **modal** (not a route) → vault setup → add a credential (all fields) → close the modal → reopen it → confirms it re-prompts for the passphrase every time (no session-cached unlock) → decrypt round trip; a wrong-passphrase case confirms it's rejected right at the unlock form (not discovered later via a decrypt failure) for a vault with a credential, and a separate case confirms the same for a brand-new vault with zero credentials; a credential-type case confirms switching to the API Key type swaps the form's fields (no Username/Password) and round-trips through a reload. All single-user (the sole member is the owner); as of Build Order step 92 every member has their **own** private vault per workspace (`user_id`-scoped RLS) — a member never sees another member's credential rows.                                     |
| `credential-folders.spec.ts`  | Create a nested folder (collapsed by default, matching the sidebar's tree), put a credential inside it via the folder's hover "New credential" icon (auto-expands it), confirm collapsing the folder hides the credential and expanding shows it again; move a credential between folders via the edit form's select and a folder via drag-and-drop; delete a folder containing a sub-folder and a credential and confirm the credential survives at root while the sub-folder doesn't; drag-and-drop reordering of sibling folders, and of sibling credentials (including reparenting a credential onto a different folder by dragging it there directly). |
| `canvas.spec.ts`              | Create a canvas → draw a real rectangle (keyboard shortcut + mouse drag) → confirm autosave actually persisted element data (verified via a direct REST call, since Excalidraw's `<canvas>` has no addressable per-shape DOM to assert against in the UI) → title survives a reload → delete via the sidebar row's "⋯" menu; drag-and-drop reordering of sibling canvases, confirming the new order survives a reload.                                                                                                                                                                                                                                       |
| `sidebar-sections.spec.ts`    | The sidebar's PAGES / CANVAS section headers collapse and expand, and the collapsed state persists across a reload (localStorage). Skipped on `mobile-safari` — the off-canvas drawer's AnimatePresence remount races the toggle clicks.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `workspace-settings.spec.ts`  | Owner-only Workspace settings modal (from the sidebar dropdown): rename → the URL slug refreshes, the id after `--` is unchanged, and the new name survives a reload; workspace description saves and persists; a logo (uploaded file) round-trips through a reload and its Storage object is cleaned up on Remove.                                                                                                                                                                                                                                                                                                                                          |
| `workspace-delete.spec.ts`    | Delete a workspace that has a page in it from the `/workspace` switcher → confirms it disappears from the list and its old URL resolves to "no pages" (RLS-level gone, not just hidden from the UI).                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `profile.spec.ts`             | Account modal's "Update profile" box: name/occupation/bio save and persist across a modal close+reopen; the "Other" occupation option reveals a free-text field whose value is what's actually saved; avatar upload succeeds and a second upload overwrites the same Storage object in place (same path, not a duplicate) rather than accumulating files.                                                                                                                                                                                                                                                                                                   |
| `vault-recovery.spec.ts`      | First-time vault setup's recovery-key screen (Continue disabled until the "I've saved this" checkbox is checked); a wrong recovery key on "Forgot passphrase?" is rejected with a clear error and a link to the last-resort reset; the correct recovery key lets you set a brand-new passphrase and the original credential still decrypts correctly afterward, both by opening it directly and by confirming the _old_ passphrase no longer works while the _new_ one does.                                                                                                                                                                                |
| `member-vaults.spec.ts`       | Per-member vaults (step 92/93), two contexts: A and B in one shared workspace each open the Credentials Vault and get the **setup** form (neither inherits the other's), each adds a credential, and neither vault's list ever shows the other member's credential — vault isolation at the RLS level, verified through the UI.                                                                                                                                                                                                                                                                                                              |
| `legal-pages.spec.ts`         | `/privacy`, `/terms`, `/contact` load without auth and cross-link; the login page links to the Terms and Privacy Policy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `account-deletion.spec.ts`    | Account modal → **Security & data** → "Delete account" (nested confirm modal; type your profile full name to arm) → the `delete-account` Edge Function removes the account and the user lands on a fresh sign-in ("Your account has been deleted"), and a same-email sign-in hits the onboarding wall (= brand-new account). Two-user case: an owner who solely owns a workspace with another member is blocked with the workspace name until they remove members / delete it.                                                                                                                                                                    |
| `abuse-caps.spec.ts`          | The `pages_content_size` CHECK rejects a >2 MB `content` PATCH (400, constraint name in the body); a normal document saves. Row-count caps (pages/canvases/credentials per workspace, workspaces per account) are trigger-enforced but not e2e'd — verified by a manual `psql` loop.                                                                                                                                                                                                                                                                                                                                                                       |
| `editor-unsaved-guard.spec.ts` | Editing then immediately navigating to another page in-app still persists the edit (unmount flush). `beforeunload` is armed while a save is pending and disarmed once it settles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `concurrent-edit.spec.ts`     | Two tabs on the same page: after tab A saves, tab B's next save conflicts (amber "changed in another tab" banner, no silent overwrite); reloading tab B shows A's text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `csp.spec.ts`                 | The **enforcing** `Content-Security-Policy` header is present on public + app routes; a walk through the BlockNote editor, Excalidraw canvas, and credentials vault produces zero CSP violations.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `captcha.spec.ts`             | The Cloudflare Turnstile widget renders on the login password step; local/CI use Turnstile's always-pass test keys so the auth buttons enable and sign-in completes. Hidden entirely when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `data-export.spec.ts`         | Account modal → **Security & data** → "Export my data" → the confirmation modal's "Download export" downloads a single JSON with every RLS-visible workspace's pages/canvases/folders/credentials; credential secrets are present in encrypted form (`secretCiphertext`/`secretIv`/`vaultSalt`) always, and decrypted inline only when the vault is unlocked at export time.                                                                                                                                                                                                                                                                  |
| `ownership-transfer.spec.ts`  | Owner A "Make owner" on member B in the Members modal → B becomes `owner`, A becomes `editor`, invalidations refresh A's own owner-gated UI (A's "Members" item disappears, B's appears). Since step 92 a transfer is no longer blocked by a vault (each member keeps their own).                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Not covered by the automated suite (manual-only): Google OAuth (needs real credentials, see
scenario 6 below), visual/design polish, the browser's native print-to-PDF output from a
`/share/[slug]` page (Playwright can assert the page renders correctly; actually producing and
eyeballing a PDF is a manual step), and **workspace-invitation email delivery** (the
`send-invitation-email` Edge Function hits Resend's real API, not Mailpit, and no-ops without
`RESEND_API_KEY` — so `workspace-invitations.spec.ts` covers the in-app accept path but not the
email itself; it also calls `auth.admin.generateLink`, which depends on the hosted Auth
redirect-URL allow-list. Iterate locally with `npx supabase functions serve send-invitation-email
--env-file supabase/functions/.env`; manual smoke test: with a verified Resend domain, invite a
real address → click Accept from a fresh browser profile → land signed-in on `/invite/<token>` →
become a member). Also manual: the `/invite/[token]` screen for expired / revoked /
already-accepted tokens, and inviting an address that has no account yet. Also the Pages code
block toolbar (`apps/web/app/_lib/CodeBlockView.tsx` —
syntax highlighting, language search/select, copy button, keyboard navigation, Ctrl+A scoping; see
`docs/ARCHITECTURE.md` Build Order step 21) — verified via ad-hoc Playwright scripts at
implementation time, not a permanent spec.

## Manual scenarios

1. Sign in with a real (non-local) email address once a hosted Supabase project is wired up —
   confirm the magic link actually arrives and the redirect origin matches the deployed URL.
2. Create several nested pages (3+ levels deep) and confirm the sidebar tree expand/collapse state
   feels reasonable — it's intentionally client-only/not persisted (see `Sidebar.tsx`), so this is
   a UX judgment call, not something to assert on programmatically.
3. Paste a large photo (with EXIF/location data) into a page — confirm in Supabase Studio's Storage
   browser that the stored file is WebP, ≤1920px on its long edge, and that the EXIF block is gone
   (compare file size/metadata against the original).
4. Publish a page, open the share link, and actually run the browser's print-to-PDF — confirm it
   reads cleanly with no editor chrome, matching the intent that this is the project's PDF export
   path (CrowScribe deliberately has no PDF generation of its own — see the root README's zero-cost
   constraints).
5. Approach Supabase Storage's free-tier limit (1GB) with real usage and confirm the compression
   settings in `PageEditor.tsx`'s `uploadFile` are still appropriate — this was flagged as a
   zero-cost risk to revisit once there's real data, not a one-time check.
6. Click "Continue with Google" with real OAuth credentials configured: the **current tab**
   navigates to Google's consent screen (no new window/tab), and after consent returns to the app
   signed in on `/workspace` (or the onboarding stepper for a brand-new Google account). Confirm
   the address bar is a clean `…/workspace` with no `#access_token` fragment left behind.
7. Set up a workspace's vault passphrase, add a few credentials, and confirm the recovery key is
   shown exactly once (Continue stays disabled until "I've saved this" is checked) and can't be
   skipped. Then deliberately "forget" the passphrase (use a different one on the next unlock) —
   confirm it's rejected with a clear error, not a silent corruption. Use "Forgot passphrase?": a
   wrong recovery key is clearly rejected; the correct one lets you set a brand-new passphrase and
   restores full access to every existing credential with nothing lost (Build Order step 58). Only
   if you also "lose" the recovery key does going through the last-resort `vault-reset` flow
   genuinely wipe the vault's credentials — confirm that's true too, and that a replayed
   (already-used) confirmation link is rejected. Also confirm the password generator's output
   actually works as a real password on some external site, and that copy-to-clipboard for
   username/password does what it says.
8. Open a canvas and confirm there's no way to insert an image (the tool is intentionally hidden —
   see `docs/ARCHITECTURE.md` Build Order step 17). Draw a variety of shapes/text, reload, and
   confirm everything survived; confirm dark/light theme switches correctly.

## Resetting between test runs

- Local: `npx supabase db reset` wipes and re-applies every migration from scratch.
- The e2e suite doesn't need this between every run — each spec creates a fresh unique-email user
  and its own workspace, so runs don't collide even without a reset. Reset if you've been doing a
  lot of manual clicking around locally and want a clean slate, or after changing a migration.
- Hosted (once a real project exists): no `db reset` equivalent — delete test rows/users manually
  via Studio, or keep a separate hosted project for testing vs. real personal use.
