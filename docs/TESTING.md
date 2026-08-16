# Testing

## Local prerequisites

```sh
npx supabase start   # boots local Postgres/Auth/Storage/Mailpit — requires Docker
pnpm dev --filter=web
```

Magic-link email is still the only way to *create* an account. Locally, "sending an email" lands
in Mailpit, not a real inbox — open `http://127.0.0.1:54324` and click the link there. The e2e
suite does this same lookup programmatically via Mailpit's REST API (`e2e/helpers.ts`). Once
signed in, `/account` lets a user set a password for future sign-ins, and the login page also
offers "Continue with Google" (opens as a popup — see `docs/ARCHITECTURE.md` Build Order step 15)
— Google sign-in needs real OAuth credentials configured (step 14) and isn't covered by the
automated suite.

## Automated suite

`apps/web/e2e/*.spec.ts`, run via `pnpm --filter web test:e2e` (or `test:e2e:ui` for interactive
debugging of a single spec). Requires the local Supabase stack running and a fresh-enough
database — see "Resetting between runs" below if specs start colliding with leftover data (in
practice this is rare since every spec uses a freshly generated unique email per run).

| `e2e/*.spec.ts` | Covers |
|---|---|
| `sign-in.spec.ts` | Magic-link sign-in end-to-end (send → Mailpit → verify URL → landed signed in, URL fragment stripped); signed-out visitors get redirected off authenticated routes. |
| `password-sign-in.spec.ts` | Set a password from `/account`, sign out, sign back in with email+password (no magic-link email round-trip). |
| `workspace-pages.spec.ts` | Create workspace → create page → edit title + BlockNote content → autosave persists across a reload → nested sub-page creation and tree display. |
| `publish-share.spec.ts` | Publish toggle → `/share/[slug]` renders content read-only (zero `[contenteditable]` elements) to a fully separate signed-out browser context → unpublish takes the share URL back down to a 404. |
| `workspace-isolation.spec.ts` | A second real user can neither see user A's workspace in their own switcher, nor read anything by navigating directly to user A's workspace URL — RLS-level isolation, not just UI filtering. |
| `credentials.spec.ts` | Opens the Credentials **modal** (not a route) → vault setup → add a credential (all fields) → close the modal → reopen it → confirms it re-prompts for the passphrase every time (no session-cached unlock) → decrypt round trip; a wrong-passphrase case confirms it's rejected right at the unlock form (not discovered later via a decrypt failure) for a vault with a credential, and a separate case confirms the same for a brand-new vault with zero credentials. |
| `credential-folders.spec.ts` | Create a nested folder (collapsed by default, matching the sidebar's tree), put a credential inside it via the folder's hover "New credential" icon (auto-expands it), confirm collapsing the folder hides the credential and expanding shows it again; move a credential between folders via the edit form's select and a folder via the move dialog (confirming the dialog excludes the folder itself); delete a folder containing a sub-folder and a credential and confirm the credential survives at root while the sub-folder doesn't. |
| `canvas.spec.ts` | Create a canvas → draw a real rectangle (keyboard shortcut + mouse drag) → confirm autosave actually persisted element data (verified via a direct REST call, since Excalidraw's `<canvas>` has no addressable per-shape DOM to assert against in the UI) → title survives a reload → delete. |
| `workspace-delete.spec.ts` | Delete a workspace that has a page in it from the `/workspace` switcher → confirms it disappears from the list and its old URL resolves to "no pages" (RLS-level gone, not just hidden from the UI). |

Not covered by the automated suite (manual-only): Google OAuth (needs real credentials, see
scenario 6 below), visual/design polish, and the browser's native print-to-PDF output from a
`/share/[slug]` page (Playwright can assert the page renders correctly; actually producing and
eyeballing a PDF is a manual step). Also the Pages code block toolbar (`apps/web/app/_lib/CodeBlockView.tsx` —
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
   path (Delft deliberately has no PDF generation of its own — see the root README's zero-cost
   constraints).
5. Approach Supabase Storage's free-tier limit (1GB) with real usage and confirm the compression
   settings in `PageEditor.tsx`'s `uploadFile` are still appropriate — this was flagged as a
   zero-cost risk to revisit once there's real data, not a one-time check.
6. Click "Continue with Google" with real OAuth credentials configured: confirm a small centered
   popup opens (not a full-tab navigation away from Delft), completes Google's consent screen, then
   self-closes with the main tab landing signed in on `/workspace`. Separately, block popups for
   `localhost`/`127.0.0.1` in the browser and confirm it falls back to a full-page redirect instead
   of silently doing nothing.
7. Set up a workspace's vault passphrase, add a few credentials, then deliberately "forget" the
   passphrase (use a different one on the next unlock) — confirm every existing credential fails to
   decrypt with a clear error rather than silently corrupting data, and that there is genuinely no
   recovery path (by design — the server never has the passphrase or key). Also confirm the
   password generator's output actually works as a real password on some external site, and that
   copy-to-clipboard for username/password does what it says.
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
