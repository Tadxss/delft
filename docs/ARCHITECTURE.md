# Architecture

Delft is a personal, zero-cost management platform (Pages, Credentials Manager, Excalidraw
Canvas) built on Next.js + Supabase + Vercel free tiers, with every feature scoped per-workspace
and isolated via Postgres Row Level Security. See the root [README.md](../README.md) for the
elevator pitch and local dev setup, [docs/TESTING.md](TESTING.md) for how the e2e suite maps
to manual test scenarios, and [docs/BETA_READINESS.md](BETA_READINESS.md) for the outstanding
audit findings (autosave error handling, mobile layout, modal accessibility, Storage cleanup) to
work through before calling this BETA.

This file's **Build Order** section below is the single source of truth for what has shipped, in
what order, why, and what was deliberately deferred — update *it*, not the README's status line,
when something ships. Entries accumulate; don't edit or delete old ones, append new ones instead.

## Next Up

Read this section first in a new session — it's the answer to "what should I work on."

**Every originally-planned feature has shipped** — Pages, auth (password + Google), Credentials
Manager, Excalidraw Canvas, and hosted deployment (live at `https://delft.vercel.app`, auto-deploying
on push to `master`). See Build Order below for how each shipped.

**Current focus: working through [docs/BETA_READINESS.md](BETA_READINESS.md)** before calling this
BETA — a full audit found real gaps (silent autosave failures, no mobile layout, `Modal.tsx`
missing dialog semantics, Storage orphaning on delete, and more, ranked by severity in that doc).
High severity items 1 (silent autosave failures) and 3 (zero responsive/mobile layout) are fixed as
of Build Order steps 30/31; Medium severity item 5 (no Safari/WebKit test coverage) is fixed as of
steps 32-33, with only a real-device-testing gap still open (no iOS Safari device/simulator
available here — see step 33). Item 2 (read-hook errors) and the rest of Medium/Low severity is
still open as of step 33.

The one recurring (not one-time) item to keep revisiting alongside that: the image-compression
settings in `PageEditor.tsx` against real Storage usage as real data accumulates — Supabase
Storage's free tier caps at 1GB.

## Data model

- `workspaces (id, owner_id, name, vault_salt, vault_verifier, vault_verifier_iv, created_at)` —
  `vault_salt` is the Credentials Manager's per-workspace PBKDF2 salt (plaintext; salts aren't
  secret), null until that workspace's vault passphrase is first set up. `vault_verifier`/
  `vault_verifier_iv` are a small AES-GCM ciphertext+iv pair, meaningless in content, used purely
  to verify a typed passphrase is correct before ever granting vault access — see Build Order
  step 22/23.
- `workspace_members (workspace_id, user_id, role)` — every RLS policy keys off membership rather
  than `owner_id` directly, so extending to real multi-user sharing later is a data change, not a
  schema/policy rewrite.
- `pages (id, workspace_id, parent_id, title, content jsonb, is_published, published_slug,
  created_at, updated_at)` — `parent_id` self-references `pages` for the sidebar tree.
- `credentials (id, workspace_id, folder_id, title, url, secret_ciphertext, secret_iv, created_at,
  updated_at)` — `title`/`url` plaintext (list view + search); `secret_ciphertext`/`secret_iv` are
  one AES-GCM ciphertext+iv pair encrypting a `{username, password, notes}` JSON payload per
  credential. See Build Order step 16. `folder_id` (nullable, `on delete set null`) places it in a
  `credential_folders` folder, or at root when null — see Build Order step 24.
- `credential_folders (id, workspace_id, parent_folder_id, name, created_at, updated_at)` — pure
  containers (name only, no secret of their own), nesting arbitrarily deep via `parent_folder_id`
  (self-referencing, `on delete cascade` — unlike `credentials.folder_id`, which is deliberately
  `on delete set null` so deleting a folder never destroys the credentials inside it). Two triggers
  (`check_credential_folder_parent`, `check_credential_folder_workspace`) guard against cycles and
  cross-workspace linking, since RLS's flat per-row membership check can't catch either on its own.
  See Build Order step 24.
- `canvases (id, workspace_id, title, scene jsonb, created_at, updated_at)` — flat, no `parent_id`
  (standalone items, not a tree like `pages`). `scene` is Excalidraw's own `{elements, appState}`
  shape; the `files` argument from Excalidraw's `onChange` (embedded image binaries) is never
  persisted. See Build Order step 17.
- `profiles (id, username, first_name, middle_name, last_name, occupation, bio, avatar_url,
  created_at, updated_at)` — the first **non-workspace-scoped** table; `id` is both PK and FK to
  `auth.users`, one row per user. Auto-created blank on signup via an `AFTER INSERT` trigger on
  `auth.users` (not a `public` table); a pre-existing account (created before this shipped)
  self-heals its first row via the client's `upsert`, not a backfill script. `username` is
  nullable/unique/lowercase-only (CHECK-enforced), letting sign-in accept a username instead of an
  email — resolved via `get_email_for_username`, an `anon`-callable function (see below). See
  Build Order steps 28-29.

RLS/grants: every workspace-scoped table requires membership (`workspace_members`) except one
deliberate hole — `pages_select_published_anon`, readable by `anon`, scoped strictly to
`is_published = true`. `credentials`, `credential_folders`, and `canvases` have no anon policy or
grant at all — `profiles`' RLS itself is also `authenticated`-only (`id = auth.uid()`, no anon
policy), but the standalone `get_email_for_username` function is explicitly `grant execute ... to
anon` — the one place in this schema an `anon` client can reach into `profiles`/`auth.users` data
at all, deliberately narrowed to a bare email-or-null return with no other fields ever exposed.
See Build Order step 29 for the reasoning and tradeoff. See `supabase/migrations/*_rls.sql` for
the full policy set and its inline reasoning.

## Build Order

1. **Monorepo scaffold.** ✅ *done*. Turborepo + pnpm workspace mirroring the sibling project
   votero's shape (`packages/eslint-config`, `packages/typescript-config`, `packages/types`,
   `packages/shared`, `apps/web`), so a future `apps/mobile` addition is a low-friction addition
   rather than a restructure. Next.js 16.2.0 (App Router), React 19.2.3, TypeScript 5.9.2, ESLint 9
   flat config, Tailwind CSS v3 (plain utility classes, no component library). No `packages/ui` —
   deferred until a second app actually needs shared components.

2. **Workspace + Pages schema, RLS, and grants.** ✅ *done*. `workspaces` / `workspace_members` /
   `pages` tables, RLS enabled on all three, explicit `GRANT`s in a companion migration (Supabase's
   `auto_expose_new_tables` is off by default — RLS alone does not expose a table via PostgREST).
   A `handle_new_workspace()` `SECURITY DEFINER` trigger auto-enrolls the creator as `role='owner'`
   in `workspace_members`, so the client only ever inserts the `workspaces` row itself.

   **Real bug found and fixed (RLS scoping):** the member-check policies on `pages`/`workspaces`
   were written without `to authenticated`, so Postgres evaluated them for `anon` requests too —
   and since `anon` correctly has no grant on `workspace_members`, evaluating an unscoped
   member-check policy for an anon request threw a hard `permission denied for table
   workspace_members` instead of just filtering to zero rows. Fixed by scoping every non-public
   policy `to authenticated` explicitly.

   **Real bug found and fixed (INSERT ... RETURNING vs. AFTER trigger):** `workspaces_select_member`
   originally only checked `EXISTS (... workspace_members ...)`. Postgres evaluates a SELECT
   policy for `INSERT ... RETURNING` (what PostgREST/supabase-js's `.insert().select()` always
   issues) against the statement's *original* snapshot, which cannot see a row an `AFTER INSERT`
   trigger wrote within that same statement — so creating a workspace failed with "new row
   violates row-level security policy" even though the insert and the trigger's own membership
   insert both succeeded. Fixed by adding an `owner_id = auth.uid()` branch to the policy, which
   needs no such row-visibility timing. Found via a failing e2e test
   (`e2e/workspace-pages.spec.ts`), not manual testing — see step 5.

   Verified via `supabase db reset` + direct `psql`/REST calls as both `anon` and `authenticated`
   roles, and end-to-end via the e2e suite (step 5).

3. **Pages feature: BlockNote editor, autosave, image compression, publish/share.** ✅ *done*.
   BlockNote (not raw Tiptap) for the block editor — it ships a ready-made Notion-style block UI
   (drag handles, slash-command menu) rather than requiring that UI to be built from scratch on top
   of Tiptap/ProseMirror, and its `uploadFile` callback is exactly where the compress/strip-EXIF
   step plugs in. Title + content autosave via an 800ms-debounced `useUpdatePage` call. Images
   route through `browser-image-compression` (max 1920px, WebP, EXIF stripped) before landing in
   the `page-images` Storage bucket. Publish toggle sets `is_published`/`published_slug`; the public
   `/share/[slug]` route is a plain anon-key server component gated entirely by
   `pages_select_published_anon`, rendering content via a read-only BlockNote view (not a
   server-side blocks→HTML export — `@blocknote/server-util`'s `ServerBlockNoteEditor` pulls in
   `react-dom/client` APIs that break under Turbopack's Server Component bundling).

   **Real bug found and fixed (autosave patch clobbering):** `PageEditor`'s `scheduleSave` shared
   one debounce timer for both title and content changes, and each call **replaced** the pending
   patch instead of merging it — so typing a title then typing content within the debounce window
   silently dropped the title update (only the content update actually saved). Fixed by
   accumulating into a `pendingPatch` ref that's merged (not replaced) on each `scheduleSave` call,
   and cleared only once actually flushed to the mutation. Found via the same failing e2e test as
   step 2's second bug.

   Verified end-to-end via the e2e suite (step 5): create/edit/reload persistence, nested sub-pages,
   publish → anonymous view → unpublish → 404.

4. **Local dev environment: `allowedDevOrigins`.** ✅ *done*. Next.js 16 blocks dev-resource
   requests (including the Turbopack HMR WebSocket) from any origin not explicitly allow-listed,
   and treats `127.0.0.1` as a *different* origin from `localhost` even on the same machine. Local
   Supabase's `site_url`/magic-link `redirect_to` defaults to `http://127.0.0.1:3000` (see
   `supabase/config.toml`), so visiting the app via `127.0.0.1` is the normal flow here — without
   `allowedDevOrigins: ["127.0.0.1", "localhost"]` in `apps/web/next.config.js`, every dev-resource
   request from that origin was silently blocked, badly enough that the Turbopack client bootstrap
   broke and the page never finished hydrating: clicking "Send magic link" fell through to a native
   HTML form submit instead of running the React handler, with zero errors logged. Root-caused via
   a Playwright script capturing full console/network output in a clean browser context, after
   manual browser testing (confounded by a wallet extension's console noise) couldn't isolate it.

5. **e2e test suite (Playwright).** ✅ *done*. `apps/web/e2e/`, mirroring votero's Playwright setup
   (`workers: 1`, `fullyParallel: false` — shared local Supabase state across specs caused spurious
   timeouts under concurrency; each spec self-contained with its own fresh `browser.newContext()`
   per simulated user, no shared fixtures/POM). `e2e/helpers.ts`'s `signIn()` polls Mailpit's REST
   API for the magic-link email and navigates to the verify URL directly (adapted from votero's
   OTP-code equivalent, which polls the same way but extracts a 6-digit code instead of a URL).
   Specs: sign-in + signed-out redirect, workspace/nested-page CRUD + autosave persistence,
   publish/share (including confirming the read-only view has zero `[contenteditable]` elements,
   and that unpublishing 404s the share URL), and a two-user workspace-isolation check (RLS, not
   just app-level filtering). This suite is what surfaced both real bugs in steps 2 and 3 — neither
   was caught by manual click-through testing.

   Verified: all 5 specs pass locally (`pnpm --filter web test:e2e`) against a freshly-reset local
   Supabase stack.

6. **CI e2e job.** ✅ *done*. Added an `e2e` job to `.github/workflows/ci.yml` alongside the
   existing `checks` job, mirroring votero's: install Playwright chromium, `supabase/setup-cli`,
   `supabase start`, run the suite, upload the HTML report as an artifact on failure. Not yet
   verified by an actual CI run — this project has no git remote yet, so nothing has been pushed to
   trigger the workflow.

7. **Dark theme + light/dark toggle.** ✅ *done*. Added `next-themes` (MIT, ~1KB) rather than
   hand-rolling the class toggle/localStorage persistence/hydration-flash prevention. The key move:
   `paper`/`ink`/`accent` in `tailwind.config.cjs` resolve to CSS custom properties (defined per
   shade under `:root` for light, `:root.dark` for dark, in `globals.css`) instead of static hex —
   so every existing `text-ink-800`/`bg-paper-50`/etc. class across the app kept working unchanged;
   only the variable each one resolves to flips with the theme. No component class names needed to
   change. BlockNote's editor (`PageEditor.tsx` and the public `SharedPageView.tsx`) reads
   `next-themes`' `resolvedTheme` and passes a matching theme into BlockNote — see step 9 below for
   why that needed more than just `theme="dark"`.

8. **Notion-style visual pass.** ✅ *done*. Switched typography to Notion's actual default stack —
   `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", ...` (each OS's native UI font,
   zero webfont files) — replacing an earlier Inter + Source Serif 4 `next/font/google` setup
   entirely, including the "Delft" wordmark (no more separate serif branding touch). Bumped title
   weights to `font-bold` (Notion's titles read noticeably bolder than a `font-semibold` guess), and
   fixed the title `<input>`'s placeholder rendering at `font-normal` — an explicit
   `placeholder:font-normal` override was fighting the bold weight change instead of inheriting it.
   Widened the editor's content column (`max-w-3xl` → `max-w-4xl`) and its top padding
   (`py-10` → `pt-20`) to read closer to Notion's spacing.

9. **BlockNote editor visually separate from the page.** ✅ *done*, **real bug found**: passing the
   literal `theme="dark"`/`"light"` string to `BlockNoteView` uses BlockNote's own **hardcoded**
   palette (`darkDefaultTheme.colors.editor.background` is `#1F1F1F`) — completely independent of
   this app's `--paper-50` variable (`#191919`), so the editor rendered as a visibly different dark
   gray "card" instead of blending into the page. Root-caused by reading
   `@blocknote/mantine/src/defaultThemes.ts` directly. Fixed via a new
   `apps/web/app/_lib/blocknoteTheme.ts`: spreads BlockNote's own default theme (so menus/tooltips/
   selection colors still look like a real BlockNote theme) but overrides `colors.editor.
   {background,text}` to `transparent`/`var(--foreground)`, and `fontFamily` to the same Notion
   system stack as step 8, so the editable area has no color or font of its own. Separately,
   `@blocknote/core`'s `editor.css` hardcodes `.bn-editor { padding-inline: 54px; }` (space for a
   drag-handle gutter) — collapsed to `0` in `globals.css` so the content's left edge lines up with
   the title input above it instead of sitting ~54px further right.

10. **Workspace URLs: `/w/{uuid}` → `/workspace/{slug}--{uuid}`.** ✅ *done*. New
    `packages/shared/src/lib/workspaceUrl.ts` (`slugifyWorkspaceName`, `buildWorkspaceHref`,
    `parseWorkspaceSlug`) centralizes what was previously 6 scattered template-literal call sites.
    Double-dash (`--`) separator, not single-dash — `slugify` collapses repeated dashes, so a slug
    can never itself contain `--`, making the id-after-last-`--` extraction unambiguous.
    `parseWorkspaceSlug` also falls back to treating a `--`-less param as a bare id directly, so old
    /manually-typed bare-UUID links still resolve. Route folders renamed
    (`app/w/` → `app/workspace/`, `[workspaceId]/` → `[workspaceSlug]/`) to match.

    Verified via the e2e suite — all workspace-URL-asserting specs updated to the new regex pattern
    and still pass.

11. **Collapsible sidebar.** ✅ *done*. `app/workspace/[workspaceSlug]/_components/SidebarShell.tsx`
    owns a `collapsed` boolean persisted to `localStorage` (`delft-sidebar-collapsed`) — a plain
    manual read/write, not `next-themes`-style tooling, since a single boolean with no
    flash-of-wrong-content risk (the sidebar is always visible either way) doesn't need it.
    Collapsed state renders a thin rail with an expand button rather than hiding the sidebar
    outright, matching Notion's collapsed-rail behavior.

12. **Restrict BlockNote to Image-only media blocks.** ✅ *done*. Video/Audio/File block types
    deliberately held back for a future paid tier — not an access-control/role check (no such
    system exists in Delft), just not offered as insertable block types at all right now. New
    `apps/web/app/_lib/blocknoteSchema.ts` builds a `BlockNoteSchema.create({ blockSpecs })` with an
    **explicit allow-list** (paragraph/heading/quote/lists/code/table/divider/image) rather than
    destructuring the three unwanted ones out of `defaultBlockSpecs` — so a future BlockNote upgrade
    adding a new media block type doesn't silently become available here too. Removing them from
    the schema (not just filtering the slash-menu UI) makes them unreachable via every insertion
    path: slash menu, the side "+" picker, drag-and-drop, and paste-to-embed.

13. **Local-dev resilience: stale session after `supabase db reset`.** ✅ *done*, **real (dev-only)
    footgun documented and mitigated**: repeatedly running `supabase db reset` while a browser tab
    has an existing session wipes `auth.users`, but the tab's JWT stays cryptographically valid
    (same JWT secret) — so a workspace-creation insert fails with `23503 workspaces_owner_id_fkey`
    ("Key is not present in table users"). Not a schema bug — the fix is signing out and back in.
    `useCreateWorkspace` now catches that specific error code, calls `supabase.auth.signOut()`, and
    throws a clear "Your session is out of date — please sign in again" message (surfaced in
    `app/workspace/page.tsx`) instead of a raw Postgres error, and `AuthGate` naturally redirects to
    the login screen once signed out.

14. **Password sign-in (add-on) + Google OAuth.** ✅ *done*. Magic link remains the only way to
    *create* an account — this adds two more ways to sign into an existing one. New
    `packages/shared/src/hooks/`: `useSetPassword` (`supabase.auth.updateUser({ password })`,
    called from a new `/account` page, requires an active session — no current-password check,
    the session itself is the proof of identity), `useSignInWithPassword`
    (`supabase.auth.signInWithPassword`), and `useSignInWithGoogle`
    (`supabase.auth.signInWithOAuth({ provider: 'google' })`). No new callback route needed for
    Google — `detectSessionInUrl: true` (already set for magic link) parses its redirect too, so
    it lands back on `/` exactly like magic link does. `AuthGate` moved from
    `app/workspace/_components/` to `app/_components/` so the new `/account` route can reuse it
    without reaching into another route's private folder.

    `supabase/config.toml` gained a real `[auth.external.google]` block (the file previously only
    had a commented-out `apple` example). Needs a Google Cloud OAuth 2.0 Client ID (free) with
    `http://127.0.0.1:54321/auth/v1/callback` registered as an authorized redirect URI for local
    dev; client ID/secret are supplied via a gitignored root `.env` (see `.env.example`) — the
    Supabase CLI's `env()` substitution reads `.env` at the repo root, not `apps/web/.env.local`.

15. **Login flow redesign, real Google branding, and popup-based Google OAuth.** ✅ *done*.
    Follow-ups to step 14, all in `apps/web/app/page.tsx` unless noted:

    - **Staged login UI.** Replaced "everything visible at once" (Google button + email + password
      + magic-link button, all on screen together) with a `step: "email" | "password" | "sent"`
      state machine: email + "Continue" first, then a password field + "Continue" with a
      lower-emphasis "Email me a sign-in link instead" fallback once the password attempt fails or
      was never set — no separate forgot-password flow, the magic link re-establishes a session
      `/account` can then use to set a new password. Deliberately **no** server-side "does this
      email have a password" check (would need the service-role key — the first server-side auth
      code in an otherwise fully-client-side app — and could be used to enumerate accounts).

      **Real bug found (test-locator ambiguity, not app bug):** the e2e suite's
      `button:has-text("Continue")` matched **both** "Continue with Google" and the email step's
      plain "Continue" button — since it's a substring match, Playwright clicked the Google button
      first and landed on Google's real "invalid_client" error page. Fixed by switching
      `e2e/helpers.ts`'s `signIn()` and `password-sign-in.spec.ts` to
      `getByRole("button", { name: "Continue", exact: true })`.

    - **Google button branding.** Replaced the generic bordered-rectangle placeholder with Google's
      actual four-color "G" logomark (inlined SVG, `GoogleLogo` in `page.tsx`) and Google's
      documented button colors — fixed white/`#747775`-border in light mode, fixed
      `#131314`/`#8e918f`-border in dark mode via `next-themes`' `resolvedTheme` — rather than
      inheriting this app's own `paper`/`ink` theme tokens, since real Google buttons intentionally
      don't reskin to match the host page.

    - **Google OAuth as a popup, not a full-tab redirect.** `useSignInWithGoogle`
      (`packages/shared/src/hooks/`) now calls `signInWithOAuth` with `skipBrowserRedirect: true`
      and returns the authorize URL instead of navigating itself; `page.tsx`'s `handleGoogleClick`
      opens that URL in a small centered `window.open(...)` popup (falling back to a full-page
      redirect if the popup is blocked). Confirmed by reading the vendored `@supabase/auth-js`
      source that this needs no custom `postMessage`/polling plumbing to work: `GoTrueClient`
      already opens a same-origin `BroadcastChannel` keyed by `storageKey` and broadcasts
      session/`SIGNED_IN` events to every other same-origin tab — so once the popup's own fresh
      client completes the PKCE exchange and writes the session to `localStorage`, the main tab's
      existing `useAuthUser()` picks it up automatically. The popup self-closes once it detects its
      own signed-in state (checked via `window.opener` + a `?authPopup=1` marker on its
      `redirectTo`, so this never fires for a normal tab/magic-link landing).

    - **Page title spacing/size.** `PageEditor.tsx`: `pt-20` → `pt-28`, title `text-3xl` →
      `text-4xl`, matching a Notion reference screenshot's proportions more closely.

    Verified manually (Google's real consent screen and the popup-blocked fallback aren't things
    the Mailpit-based e2e setup can drive) plus a full `pnpm --filter web test:e2e` run (all 6
    specs) and `pnpm lint`/`check-types`/`build` after each change.

16. **Credentials Manager.** ✅ *done*. Per-workspace encrypted vault (title, username, password,
    URL, notes), matching the design already sketched under "Next Up" with the exact-shape
    decisions made at implementation time:

    - **Schema**: `supabase/migrations/*_credentials.sql` + `*_credentials_rls.sql`. One new
      `credentials` table plus `workspaces.vault_salt` (see Data model above). RLS mirrors `pages`'
      member-based policies exactly (same `to authenticated` scoping, same reasoning) but with
      **no anon policy or grant at all** — verified via a direct REST call with the anon key
      (`42501 permission denied for table credentials`), confirming zero exposure rather than
      trusting RLS alone.
    - **Field shape decided**: `title`/`url` stay plaintext (needed for the list view and search
      without decrypting everything up front). `username`/`password`/`notes` are bundled into
      **one** JSON payload, encrypted together as a single ciphertext+IV pair per credential —
      simpler than three separate ciphertext columns, and decryption only happens when a specific
      entry is opened, not for the whole list.
    - **Crypto**: new `packages/shared/src/lib/vaultCrypto.ts` — PBKDF2-SHA256 at 310,000
      iterations (current OWASP-recommended minimum, deliberately not configurable — bumping it
      later would strand existing ciphertext without a re-encrypt migration) deriving a
      non-extractable AES-GCM `CryptoKey`, plus `generatePassword()` for the add/edit form's
      "Generate" button. One salt per workspace (`vault_salt`), not per-credential.
    - **In-memory key only**: new `packages/shared/src/vault/VaultKeyContext.tsx` holds derived
      keys in a `Map<workspaceId, CryptoKey>` inside a ref (never `localStorage`/`sessionStorage`).
      `VaultKeyProvider` is mounted in `apps/web/app/workspace/layout.tsx` **inside** `AuthGate`'s
      authenticated render, so signing out (which unmounts everything under `AuthGate`) discards
      every derived key for free — no extra sign-out wiring needed.
    - **No passphrase verification beyond decryption itself** — there's no server-side check
      possible by design (the server never sees the passphrase or key). A wrong passphrase just
      means the first `decryptSecret` call throws (AES-GCM's built-in auth tag fails on a wrong
      key), surfaced as "Couldn't decrypt — check your vault passphrase." Known, intentional
      limitation of zero-knowledge encryption, not a bug.
    - **UI**: `apps/web/app/workspace/[workspaceSlug]/credentials/` — a vault-unlock gate
      (`VaultUnlockPanel.tsx`, first-time setup vs. enter-passphrase depending on whether
      `vault_salt` is set) then a master-detail view (`CredentialList.tsx` +
      `CredentialDetail.tsx`), reachable via a "Credentials" link added to `Sidebar.tsx`. No new
      modal/dialog primitive was introduced — this codebase had none before, and destructive
      actions already use plain `window.confirm(...)` (mirrored here for delete), so the add/edit
      form is an inline panel instead, consistent with existing patterns.

    Verified via 2 new e2e specs (`e2e/credentials.spec.ts`): full vault-setup → add-credential →
    lock → reload → re-unlock → decrypt round trip (confirming the key is genuinely gone after
    lock/reload, not silently cached anywhere), and a wrong-passphrase case confirming the decrypt
    failure surfaces as a clear error rather than garbage data. Both passed on the first real run.
    Plus the anon-grant REST check above, `pnpm lint`/`check-types`/`build`, and the full existing
    e2e suite (8 specs total) passing unmodified.

17. **Excalidraw Canvas.** ✅ *done*. Standalone per-workspace canvases (`@excalidraw/excalidraw`
    0.18.1, MIT), own table, own flat sidebar section — not embedded in Pages, not nested (no
    `parent_id`), matching the "standalone workspace items" design already decided under "Next Up."

    - **First `next/dynamic(..., { ssr: false })` in this codebase.** Excalidraw touches
      `window`/`document` at module load and cannot be server-rendered at all — unlike BlockNote
      (the Pages editor), which tolerates SSR fine as a plain `"use client"` import. Since `ssr:
      false` means the server renders nothing for it, there's no server/client HTML to diverge —
      no hydration-mismatch risk the way the Google-button `resolvedTheme` bug was (step 15), so no
      `mounted`-guard was needed here; the canvas's `theme` prop reads `resolvedTheme` directly.
    - **No rendered image/binary, enforced two ways, not just documented.** `scene` (jsonb) stores
      only Excalidraw's `elements`/`appState` — the third `onChange` argument (`files`, embedded
      image binaries) is never included in what gets saved. To avoid the confusing experience of a
      pasted image rendering during the session then silently vanishing on reload, the
      image-insertion tool itself is hidden via `UIOptions={{ tools: { image: false } }}` — what's
      offered matches what's actually persisted. `appState.collaborators` (a live `Map`, irrelevant
      in this non-collaborative app) is also stripped before saving.
    - **Schema/RLS/hooks**: `supabase/migrations/*_canvases.sql` + `*_canvases_rls.sql`, mirroring
      `pages`'/`credentials`' exact conventions (same trigger shape, same `to authenticated`
      scoping) — no anon policy or grant at all, verified via the same direct-REST-call approach as
      step 16 (`42501 permission denied for table canvases`). `packages/shared/src/hooks/`:
      `useCanvases`/`useCanvas`/`useCreateCanvas`/`useUpdateCanvas`/`useDeleteCanvas`, identical
      shape to the Pages hooks (query keys `["canvases", workspaceId]` / `["canvas", id]`).
    - **Autosave**: `CanvasEditor.tsx` uses the exact same 800ms-debounced merge-pending-patch
      `scheduleSave` pattern as `PageEditor.tsx` (title + scene can both change within the debounce
      window and must not clobber each other — the bug already found and fixed once for Pages,
      step 3, deliberately not re-introduced here).
    - **Sidebar**: a new flat "Canvas" section in `Sidebar.tsx` (header + `+` + row list) — no
      `PageTreeNode`-style recursion, since canvases don't nest.

    **Real bug found (test-only, not app code):** the first e2e attempt drew a rectangle at
    coordinates that landed on Excalidraw's own floating tool-properties panel (stroke/background/
    etc., which docks over the canvas's left edge whenever a drawing tool is active) instead of the
    canvas itself — the shape silently failed to get created. Fixed by drawing further right,
    clear of the panel. Root-caused via the test's own failure screenshot, not guesswork.

    Verified via a new `e2e/canvas.spec.ts`: create a canvas, draw a real rectangle (keyboard
    shortcut to select the tool, real mouse drag), and — since Excalidraw renders to a `<canvas>`
    element with no addressable per-shape DOM nodes to assert against — confirm the autosave
    actually persisted real element data by reading the signed-in user's access token out of
    `localStorage` and querying the REST API directly for `scene.elements.length > 0`, rather than
    trusting a UI-only check. Plus title-persistence-after-reload and delete. All passed on the
    fixed attempt. Full suite (9 specs total) plus `pnpm lint`/`check-types`/`build` all green.

18. **Hosted deployment.** ✅ *done*. `master` and `develop` were both pushed to `origin` for the
    first time this step (they'd only ever existed locally before) — `master` fast-forwarded cleanly
    to `develop`'s tip, merged with an existing GitHub-side PR merge commit that turned out to have
    identical content (confirmed via an empty `git diff` before merging, not assumed).

    - **Supabase**: a hosted project named "delft" (ref `xxpesmgtnuzlhnlqyrje`, `ap-southeast-2`)
      already existed from a previous session — linked via `supabase link --project-ref ...`, then
      all 8 local migrations applied cleanly via `supabase db push` to what was an empty database.
      Deliberately did **not** run `supabase config push` — it would push the *entire* resolved
      `config.toml`, including `site_url = "http://127.0.0.1:3000"` (correct for local dev, wrong
      for production), silently breaking hosted auth redirects. The `[auth]` URL settings and the
      Google provider are hosted-only Dashboard configuration instead, kept deliberately decoupled
      from local `config.toml` rather than introducing a shared-state hazard between the two
      environments.
    - **Vercel**: **Real bug found and fixed** — linking (`vercel link`) and deploying directly from
      `apps/web` failed with `npm install exited 1`, because that only uploads the subdirectory's
      101KB, not the monorepo root's `pnpm-lock.yaml`/`pnpm-workspace.yaml` that `workspace:*`
      dependencies need to resolve. Fixed by removing that link, re-linking from the **repo root**
      instead (uploads the full monorepo, ~81MB), and setting the project's Root Directory to
      `apps/web` via `vercel project update web --root-directory apps/web` — that combination is
      what lets Vercel's build run `pnpm install` at the true workspace root while still building
      only the Next.js app. `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` set for
      Production via `vercel env add ... --value`, pointed at the hosted project above.
    - **Second real bug found and fixed**: the project's default `*.vercel.app` domains (including
      the freshly-claimed `delft.vercel.app`) returned a 302 to Vercel's SSO login — deployment
      protection was set to `all_except_custom_domains` by default, which gates every `vercel.app`
      subdomain (not just previews) behind team login. For a personal app meant to be reachable by
      just visiting the URL, that's wrong — disabled via
      `vercel project protection disable delft --sso`, confirmed publicly reachable (`200`, real
      page content) afterward, not just assumed from the command succeeding.
    - Project renamed `web` → `delft` (`vercel project rename`) purely for a cleaner domain; the
      auto-generated original alias didn't update on rename, so `delft.vercel.app` and
      `delft-tadxss-projects.vercel.app` were added explicitly via `vercel alias set`.
    - **Git integration**: `vercel git connect` initially failed (repo is public, so not a
      visibility issue) — Vercel's GitHub App wasn't yet authorized for this repo, a one-time
      browser action only the user could do. Once authorized, re-running `vercel git connect`
      confirmed the connection; auto-deploy was then verified for real (not just assumed working):
      merged and pushed a commit to `master`, watched a new deployment start building ~20s later
      via `vercel ls`, waited for it to reach `Ready`, then `curl`'d `delft.vercel.app` again to
      confirm the production alias actually served that fresh build.
    - **Hosted auth config**: the hosted project's Auth Site URL/Redirect URLs (Dashboard →
      Authentication → URL Configuration → `https://delft.vercel.app`) and the Google provider
      (Dashboard → Authentication → Providers → Google, same Client ID/Secret as local `.env`, plus
      `https://xxpesmgtnuzlhnlqyrje.supabase.co/auth/v1/callback` added as an authorized redirect
      URI in Google Cloud Console) were both set by the user via their respective dashboards —
      deliberately not scripted, per the `config push` risk noted above.

    Live at `https://delft.vercel.app`, verified via direct `curl` (status code and real page
    content, e.g. "Careful records. Quiet craft"), not just a successful build log.

    **Recurring gotcha, confirmed again in step 25's deploy**: `delft.vercel.app` is a manually
    claimed alias (`*.vercel.app` subdomains can't be registered via `vercel domains add`, only
    `vercel alias set`), so it does **not** auto-follow new Production deployments the way
    `delft-tadxss-projects.vercel.app` does — after every deploy it must be explicitly re-pointed
    (`vercel alias set <new-deployment-url> delft.vercel.app`) or it silently keeps serving
    whatever it was last aliased to, which reads exactly like "the deploy didn't work" when it
    actually did. Every deploy must also check `supabase migration list` (no `--local`) for any
    `local` migration with a blank `remote` — a missing migration on hosted doesn't error, writes
    to the missing table/column just no-op, which reads like a broken feature rather than a
    database-sync gap. Confirmed as a real recurrence during step 25's deploy: 3 migrations
    (`vault_verifier`, `credential_folders`, `credential_folders_rls`) were pending on hosted and
    had to be pushed, and the short alias was pinned to a 23-hour-old deployment.

19. **Workspace deletion, and Credentials moved from a page to a modal.** ✅ *done*. Two gaps
    reported after using the deployed app for real.

    - **Workspace deletion had genuinely never been wired up** — confirmed by grepping the RLS/
      grants migrations before writing any code: no `for delete` policy and no `DELETE` grant
      existed on `workspaces` at all, not even client-side dead code calling a missing endpoint.
      New `supabase/migrations/*_workspaces_delete.sql`: an owner-only policy mirroring
      `workspaces_update_owner`'s `owner_id = auth.uid()` gate, plus the grant. No extra cleanup
      needed beyond that — `workspace_members`/`pages`/`credentials`/`canvases` all already
      reference `workspace_id` with `on delete cascade`, so deleting the workspace row cascades
      everything else for free. New `useDeleteWorkspace` hook; a "Delete" action (hover-revealed,
      `window.confirm`-gated, matching existing destructive-action conventions) added next to each
      workspace on the `/workspace` switcher list, only rendered when the signed-in user is that
      workspace's owner (RLS enforces this regardless — the client-side check is just UX, not the
      real boundary). Verified: anon gets `42501 permission denied` on a raw REST `DELETE` call
      (same pattern used to verify every other table's grants), and a new e2e spec deletes a
      workspace that has a page in it, confirms it disappears from the switcher, and confirms its
      old URL resolves to "no pages" (the row is actually gone, not just hidden).
    - **Credentials Manager moved from a route (`/workspace/[slug]/credentials`) to a modal**,
      opened via a "Credentials" button in the sidebar from anywhere in a workspace, and — per an
      explicit user request — **always re-prompts for the vault passphrase on every open**, not
      once per browser session. This is a deliberate security/friction tradeoff the user chose
      after being told a 6-digit PIN (their first request) would be dramatically weaker than a
      passphrase against offline brute-force if the DB ever leaked; they kept the stronger
      passphrase and asked for the always-re-prompt behavior instead of switching to a PIN.
      Implementation: `CredentialsModal`'s `open` effect calls `vaultKey.lock()` (the same
      `VaultKeyContext` from Build Order step 16, unchanged) whenever it transitions to closed —
      covers the explicit × button, Escape, and backdrop-click uniformly, so there's no path that
      leaves a derived key cached across a close/reopen. New `apps/web/app/_components/Modal.tsx`
      is the **first modal primitive in this codebase** (backdrop + panel, Escape + backdrop-click
      to close via a portal to `document.body`, deliberately no focus trap or dialog library —
      matches how little UI infrastructure the rest of the app has needed). The three existing
      credential subcomponents (`VaultUnlockPanel`/`CredentialList`/`CredentialDetail`) moved
      (`git mv`, history preserved) from the now-deleted route's `_components/` into
      `[workspaceSlug]/_components/credentials/`, unchanged internally — only their container
      changed from a full page to a modal body.

    Verified via 2 new/rewritten e2e specs (`workspace-delete.spec.ts`, and `credentials.spec.ts`
    rewritten for the modal — click-to-open instead of URL navigation, and the "close then reopen
    without a reload" flow as the direct test of the new always-re-prompt behavior, not just the
    pre-existing reload check) plus the full suite (10 specs total), `pnpm lint`/`check-types`/
    `build`, and the anon-DELETE REST check above.

20. **Real bug found and fixed: Vercel Preview builds failing (missing env var scope).** ✅ *done*.
    Pushing to `develop` opened a PR into `master`, and its Vercel check failed with
    `useSupabaseClient must be used within a SupabaseProvider` while statically prerendering `/`.
    Root cause, confirmed via `vercel env ls` before touching anything: `NEXT_PUBLIC_SUPABASE_URL`/
    `NEXT_PUBLIC_SUPABASE_ANON_KEY` (set in Build Order step 18) were scoped to **Production only**.
    Vercel's git integration deploys every branch as a Preview, and `apps/web/app/providers.tsx`
    deliberately skips mounting `SupabaseProvider` when those vars are absent — so any hook calling
    `useSupabaseClient()` (e.g. `app/page.tsx`'s `useAuthUser`) throws, and Next.js hits that during
    the build's prerender pass for `/`, failing the whole build. Fixed by adding both vars to the
    **Preview** and **Development** Vercel environments too, same hosted-project values already
    used for Production — this app has no separate staging Supabase project, so reusing the one
    hosted project across all three Vercel environments is correct here, not a shortcut. No source
    change needed. Verified via a real Preview deploy (`vercel`, not `--prod`) reaching `READY` and
    a direct `curl` of the resulting preview URL confirming real page content — not just a green
    build log.

21. **Notion-style code block toolbar for Pages.** ✅ *done*. The editor's `codeBlock` had no
    syntax highlighting or language picker at all (`defaultBlockSpecs.codeBlock` from
    `@blocknote/core`) — replaced end to end, in three passes as real problems surfaced.

    - **Pass 1 — syntax highlighting.** Added `@blocknote/code-block` (bumping
      `@blocknote/core`/`react`/`mantine` 0.53.0 → 0.54.0 for its peer requirement) and wired
      `codeBlockOptions` + the `syntaxHighlighter` extension (Shiki-based, 48 languages) into
      `restrictedBlockSchema` (`apps/web/app/_lib/blocknoteSchema.ts`) and both `useCreateBlockNote`
      call sites (`PageEditor.tsx`, `SharedPageView.tsx`).
    - **Pass 2 — replacing the picker + fixing a real Enter bug.** `createCodeBlockSpec`'s
      language picker is a bare, unstyled native `<select>`, and — a genuine bug, not a style
      complaint — plain `Enter` silently exits the block after two blank lines with no warning,
      confirmed reproducible with exactly three consecutive `Enter` presses. Neither is patchable
      in place: the picker and the keyboard-shortcuts extension that causes the Enter behavior are
      both internal, not part of `@blocknote/core`'s public API. Replaced the whole spec with a
      custom one built from what *is* public — `createCodeBlockConfig`,
      `parsePreCode`/`parsePreCodeContent`, `createExtension` — new files under `apps/web/app/_lib/`:
      `customCodeBlockSpec.tsx` (assembly), `codeBlockKeyboardShortcuts.ts` (a local port of the
      internal shortcuts extension, with the auto-exit-on-blank-lines heuristic removed — `Enter`
      always inserts a newline now; keyboard exit still works via normal arrow-key navigation past
      the block boundary), and `CodeBlockView.tsx` (the new toolbar: searchable language picker +
      copy button).
    - **Real bug found and fixed: toolbar broke the block's own boxed look.** The first toolbar
      layout wrapped `<pre>` in an extra `<div>`, which silently broke
      `.bn-block-content[data-content-type=codeBlock]>pre{padding:24px}` — a rule BlockNote ships
      keyed to `<pre>` being a **direct child** of the block wrapper. Root-caused by tracing the
      actual loaded CSS chain (`@blocknote/mantine/style.css` → `blocknoteStyles.css` →
      `@blocknote/react/style.css`, not just assumed from `@blocknote/core`'s copy). Fixed by
      returning the toolbar and `<pre>` as siblings instead of nesting them, and made the toolbar
      always-visible (not hover-revealed) at the same time, per a reference screenshot.
    - **Toolbar UX**: language search is fully keyboard-navigable (opens with the current language
      pre-highlighted and scrolled into view, arrow keys move the highlight, Enter selects, Escape
      closes) with `listbox`/`option`/`aria-selected`/`aria-expanded` wired up, not just mouse-only.
    - **Real bug found and fixed: Ctrl/Cmd+A inside a code block selected the whole document.**
      Added a `Mod-a` handler to `codeBlockKeyboardShortcuts.ts` that scopes the selection to the
      block's own text via `prosemirror-state`'s `TextSelection` — added as a new direct dependency
      of `apps/web`, deliberately pinned to the exact version range `@blocknote/core` itself
      resolves (`^1.4.4`) so pnpm dedupes to the same install rather than risking a second copy
      (BlockNote's own code does `instanceof TextSelection` checks internally, which only hold
      across a single shared copy).

    **Not covered by the automated e2e suite** — verified instead via ad-hoc Playwright scripts run
    against the live dev server at each step (multi-line entry via repeated `Enter`, language
    search/select, copy-to-clipboard content, keyboard nav, Ctrl+A scoping, light/dark theme, the
    read-only `/share/[slug]` view) plus screenshots compared against reference images, none of
    which were kept as permanent spec files. `pnpm lint`/`check-types` and the full existing e2e
    suite (10 specs, unmodified) were re-run clean after every pass.

22. **Real bug found and fixed: the vault's wrong-passphrase case wasn't rejected until one click
    too late.** ✅ *done*. Reported as "I can access the passwords with an incorrect passphrase" —
    investigated in full before touching anything; no secret was ever actually decrypted/shown with
    a wrong passphrase (AES-GCM's auth tag makes that cryptographically impossible, confirmed by
    tracing `CredentialDetail.tsx`'s decrypt-failure branch, which renders only the error, never
    stale/partial plaintext). The real gap was upstream of that: `VaultKeyContext.unlock()`
    (Build Order step 16) derives a PBKDF2 key and unconditionally marks the workspace "unlocked" —
    PBKDF2 can't fail on a wrong passphrase, it just deterministically derives a *different* key —
    so **any** passphrase, right or wrong, passed straight through the unlock screen to the
    credential list, with wrongness only surfacing later, quietly, the moment a specific credential
    was opened. That's a real gate-placement bug, not a crypto bug: the rejection belonged at the
    unlock form, not one click downstream of it.

    - **Fix**: `VaultUnlockPanel.tsx`'s non-setup submit path now derives the key and
      test-decrypts an existing credential (`credentials[0]`, now fetched by
      `CredentialsModal.tsx` as soon as the modal opens rather than only after "unlock," since the
      row itself — still-encrypted `secretCiphertext`/`secretIv` plus the already-plaintext
      `title`/`url` — is already RLS-scoped to workspace members regardless of vault state) *before*
      ever calling into `VaultKeyContext`. Only on success does it call a new
      `VaultKeyContext.setKey()` (added alongside `unlock()` specifically so a key that's already
      been derived-and-verified doesn't pay for a second, redundant 310,000-iteration PBKDF2 just to
      get stored). A failed verification shows "Wrong passphrase — please try again." right on the unlock form and
      never stores a key at all — `CredentialsModal` simply never leaves the unlock screen.
    - **One honestly-documented residual limitation, not fixed because it can't be**: a vault with
      *zero* credentials yet has nothing anywhere to verify a passphrase against (the server never
      sees the passphrase, by design — there's no separate stored verifier). First unlock on an
      empty vault still has to proceed on trust, same as initial setup. Verified this doesn't error
      or hang (manual + ad-hoc script check), just genuinely can't distinguish right from wrong yet.

    Verified via a rewritten `e2e/credentials.spec.ts` wrong-passphrase case (now asserts rejection
    *at the unlock form* — "Wrong passphrase — please try again.", credential list never reached — then confirms
    the correct passphrase still works immediately after on the same form) plus the full suite
    (10 specs) and `pnpm lint`/`check-types`, all green.

23. **Closed the empty-vault gap from step 22 with a dedicated passphrase verifier.** ✅ *done*.
    Step 22 fixed wrong-passphrase rejection for any vault that already has a credential to
    test-decrypt against, but explicitly documented one residual gap: a brand-new vault with zero
    credentials had nothing anywhere to verify a passphrase against, so it still proceeded on
    trust. User-reported after finding it live. Closed properly rather than just re-documented:

    - **Schema**: `supabase/migrations/20260816074505_vault_verifier.sql` adds
      `workspaces.vault_verifier` / `vault_verifier_iv` (both nullable text, no RLS/grant changes —
      already covered by the existing row-level `workspaces_select_member`/`workspaces_update_owner`
      policies, same as `vault_salt`). Applied locally via `supabase migration up` (not `db reset`
      — no need to wipe local data for an additive column change) and regenerated
      `packages/types/src/database.ts`.
    - **A verifier is a small, meaningless-content ciphertext** (`vaultCrypto.ts`'s
      `encryptVerifier`/`verifyVaultKey` — encrypts a fixed marker string; only whether the decrypt
      succeeds matters, never the plaintext) — the same AES-GCM auth-tag mechanism as
      `decryptSecret`, just decoupled from needing a real credential to exist.
    - **New vaults**: `VaultUnlockPanel.tsx`'s setup path now derives the key, encrypts a verifier,
      and saves salt+verifier together in one `useSetVaultSalt` call (its mutation signature grew
      the two new required fields) — verified from the very first unlock, never trust-only.
    - **Legacy vaults** (created before this shipped) fall back to the step-22 credential-test
      mechanism when `vault_verifier` is null, and *self-heal*: a successful unlock via that
      fallback fires a best-effort, fire-and-forget `useSetVaultVerifier` (new hook) to backfill the
      verifier, so every unlock after the first uses the fast/universal verifier check instead. This
      backfill can silently no-op for a non-owner member (`workspaces_update_owner` is owner-only,
      same as the salt itself) — harmless, it just retries on the owner's next unlock.
    - **The one truly unavoidable case**: a legacy vault with *zero* credentials AND no verifier yet
      still has nothing to check on its very first post-upgrade unlock — but that single unlock now
      immediately backfills the verifier too, so it's never trust-only a second time. Confirmed via
      an ad-hoc script directly manipulating Postgres (`docker exec ... psql`, since the local
      `service_role` lacks a `workspaces` SELECT grant PostgREST would need — a local-only gap, not
      touched, since the app itself never uses the service role) to simulate a pre-migration vault
      in both the with-credential and zero-credential states, confirming rejection, correct-unlock,
      and backfill in each.

    Verified via a new e2e case ("wrong passphrase is rejected even on a brand-new vault with zero
    credentials" — the exact scenario that used to be an open gap) plus the full suite (11 specs)
    and `pnpm lint`/`check-types`, all green.

24. **Nested folders for the Credentials Manager.** ✅ *done*. Credentials were flat per-workspace
    — no grouping. Added arbitrarily-deep nested folders (a folder holds both credentials and more
    sub-folders), plus the ability to move an existing credential or folder afterward, not just
    create-in-place. Researched Pages' existing `parent_id` tree first and mirrored it deliberately,
    with two differences explained below.

    - **Schema**: `supabase/migrations/20260816090000_credential_folders.sql` +
      `20260816090010_credential_folders_rls.sql` — new `credential_folders` table
      (`parent_folder_id` self-references, `on delete cascade`) plus `credentials.folder_id`
      (nullable, **`on delete set null`**, not cascade — the one deliberate deviation from
      `pages.parent_id`'s uniform cascade: deleting a folder must never destroy the credentials
      inside it, since a lost password is often costly to recover — reset it on the real site —
      unlike a lost empty folder shell). RLS is the exact 4-policy member-scoped shape as
      `credentials`/`pages`, no anon policy, plus the required companion grants migration.
    - **Two new integrity triggers**, needed because "move a folder" is new ground Pages has never
      had to guard (nothing lets a client retarget a page's `parent_id` today): 1)
      `check_credential_folder_parent` rejects self-parenting and moving a folder into one of its
      own descendants (recursive CTE) 2) both it and `check_credential_folder_workspace` (on
      `credentials.folder_id`) reject cross-workspace linking — RLS's flat per-row membership check
      can't catch a two-workspace member linking a folder in workspace A to a parent in workspace B,
      since both rows independently satisfy membership.
    - **Real bug found via `rls-reviewer` before ever applying the migration**: both triggers were
      initially scoped to `before update of parent_folder_id` / `before update of folder_id` only —
      updating `workspace_id` directly (bypassing those columns) slipped past both checks entirely.
      Fixed by also watching `workspace_id` in each trigger's column list. Verified directly via
      `psql` afterward: self-parent, multi-level cycle, and both cross-workspace paths (including
      the fixed `workspace_id` bypass) all correctly rejected; a legitimate rename still succeeds;
      the cascade/set-null interaction (delete root → cascades to child folder → credential inside
      survives with `folder_id` nulled) works with no orphan and no error.
    - **UI**: initially shipped as Finder-style drill-down with a breadcrumb trail, then redesigned
      (same day) to an always-visible collapsible tree — `CredentialFolderTreeNode.tsx` mirrors
      `PageTreeNode.tsx`'s exact shape (same `depth * 14 + 4`px indentation, `▾`/`▸` toggle hidden
      via `invisible` when a folder has nothing to expand, same `group`/`group-hover:flex`
      hover-reveal), extended for two child types per folder — sub-folders (recursed as more tree
      nodes) and credentials (plain leaf rows, `CredentialLeafRow`, shared with the root-level list
      in `CredentialList.tsx`). `CredentialList.tsx` owns an `expanded: Set<string>` exactly like
      `Sidebar.tsx`'s, not a `currentFolderId`; there's no "active folder" concept — the toolbar's
      "+ folder"/"+ credential" always create at root (mirroring `Sidebar.tsx`'s top `+` always
      calling `createChild(null)`), while each folder row's own hover-revealed icons create directly
      inside that folder and auto-expand it afterward so the new item is immediately visible. Other
      pieces are unchanged from the original build: inline rename (no dialog), a small new
      `MoveCredentialFolderModal.tsx` (wraps the existing `Modal.tsx` primitive) whose folder picker
      excludes the folder itself and all its descendants client-side (mirroring the server trigger's
      check), and a plain native `<select>` added to `CredentialDetail.tsx`'s existing edit form to
      move a credential. Search stayed global (matches folder names and credential title/url across
      the whole tree) whenever non-empty; clicking a matched folder now expands it and all its
      ancestors in place (`revealFolder`) instead of navigating into it. Separately, the modal grew
      from `h-[600px]` to `h-[720px]` so the credential list/detail panes fit without scrolling.
    - **Real bug found and fixed during live verification, not by static review**: creating a
      credential or folder and immediately referencing its new id (opening it / entering inline
      rename) could transiently disappear — `useCreateCredential`/`useCreateCredentialFolder` only
      called `invalidateQueries` on success, which triggers a background refetch, not a synchronous
      cache update. A stale-state recovery effect added to `CredentialsModal.tsx` (bounces
      `currentFolderId`/`selectedId` back toward root if they ever stop resolving against a fresh
      fetch — needed for the real case of a folder or credential being deleted from another tab)
      would see the brand-new id "missing" from the still-stale cached list for one render and
      incorrectly reset the selection. Caught by the *existing* `credentials.spec.ts` suite failing,
      not by new-feature testing — a good reminder that root-level regression coverage earns its
      keep. Fixed by having both create hooks merge the new row into the query cache synchronously
      (`setQueryData`) in addition to invalidating, so the id is always resolvable the instant a
      caller acts on it.

    Verified via `e2e/credential-folders.spec.ts` (rewritten for the tree redesign: expand/collapse
    controls visibility rather than drill-down navigation, moving a credential via the edit form and
    a folder via the move dialog, and — the single most important case given what's at stake —
    deleting a folder with a credential inside it and confirming the credential survives at root)
    plus the *existing* `credentials.spec.ts` (confirms root-level/no-folder behavior wasn't
    disturbed — this is what caught the cache-race bug above), the full suite (14 specs), `pnpm
    lint`/`check-types`, direct `psql` trigger testing, and a live screenshot confirming the tree's
    indentation/icons visually match `Sidebar.tsx`'s.

25. **Sidebar/header redesign: Notion-style hover affordances, `lucide-react` icons, and an
    icon-only header.** ✅ *done*, merged to `master` and deployed. The sidebar read flat compared
    to Notion (the page tree's chevron was permanently visible whenever a page had children, and
    every icon in the app — theme toggle, collapse, tree chevrons — was a plain Unicode glyph), and
    the header was busier than it needed to be (a text "Account" link, the raw email, and a
    separate "Sign out" button all sitting next to the theme toggle).

    - **`lucide-react` added** as the app's first real icon dependency, replacing every Unicode
      glyph (▾ ▸ + « » × ☀ ☾) across `Sidebar.tsx`, `PageTreeNode.tsx`, `SidebarShell.tsx`,
      `ThemeToggle.tsx`, and the modal close buttons.
    - **Page tree hover affordances**: the expand/collapse chevron switched from
      `hasChildren ? "" : "invisible"` (always visible when a page has children) to an
      opacity-based `group-hover:opacity-100` reveal on the row — chosen over toggling
      `hidden`/`flex` specifically because opacity never affects layout, so hovering can't shift
      the title's start position. Also added `group-focus-within:opacity-100` (and the same on the
      existing hover-only "+" button) so keyboard users tabbing through the tree aren't left unable
      to reach a control that's invisible until hover — a real regression risk once the chevron
      became hover-gated too, not just a nice-to-have.
    - **Header collapsed to icon-only**: `TopBar` (`apps/web/app/workspace/layout.tsx`) now shows
      just a theme toggle and a gear icon opening a new `AccountModal`
      (`apps/web/app/_components/AccountModal.tsx`) — email display, a "Password" settings box
      (ported the old standalone `/account` page's set-password form, which is now deleted), and
      Sign out. The Credentials button also moved from the sidebar into the header as a key icon —
      this required lifting `CredentialsModal`'s state up from `[workspaceSlug]/layout.tsx` into
      the *parent* `workspace/layout.tsx`, even though the credentials button should only show
      inside an actual workspace (not on the bare `/workspace` switcher). Solved via
      `useParams<{ workspaceSlug?: string }>()` — confirmed Next.js's `useParams()` returns the
      dynamic segments of the full matched URL regardless of which layout in the tree calls it, so
      `TopBar` reads `workspaceSlug` correctly and gates the icon/modal render on it being defined.
    - **`AccountModal` iterated twice on the same day**: shipped first as the password form shown
      directly in the modal body, then reworked into a list-of-settings-boxes + drill-down pattern
      (a "Password" box that navigates into its own sub-view with a back chevron in the header) —
      the flat version didn't scale to a second setting being added later, which is exactly what
      happened next (see the "Update profile" entry once that ships).
    - **Sidebar collapse control promoted to its own row**, separate from "Pages" (previously
      shared a row with the "Pages" label and its "+" button), hover-reveal like the tree icons
      (same `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100` treatment, on a
      `group` added to the sidebar's root `<nav>`). Icon is `ChevronsLeft` when expanded; the
      collapsed rail's expand icon is `Menu` (hamburger) — both by explicit user choice, not a
      default from the lucide swap above.

    Verified via `pnpm check-types`/`lint`, the full e2e suite (selectors updated in
    `credentials.spec.ts`/`credential-folders.spec.ts`/`password-sign-in.spec.ts` since the
    Credentials/Account buttons are icon-only now — `button:has-text(...)` no longer matches, so
    those switched to `getByRole("button", { name })`, which also matches on `aria-label` and
    keeps working going forward), and Playwright screenshots in both light and dark mode.

26. **Sidebar page-tree "⋯" menu wired up: Rename and Delete.** ✅ *done*, not yet merged to
    `master`. Step 25 added the hover-reveal "⋯" button as a deliberate stub
    (`console.log`-only, with a `TODO`) — the user noticed it did nothing and confirmed it should
    become a real menu. Wired up with the two actions the codebase already had hooks for, rather
    than inventing new ones: **Rename** (`useUpdatePage`, turns the row into an inline `<input>`,
    same focus/select-on-open pattern `CredentialFolderTreeNode.tsx` already established for
    folder rename — a `renameInputRef` focused via `useEffect`, not the `autoFocus` prop, which
    trips `jsx-a11y/no-autofocus`) and **Delete** (`useDeletePage`, reusing `PageEditor.tsx`'s
    exact confirm copy — "Delete this page and all of its sub-pages?" — and its
    redirect-to-workspace-root-if-currently-viewing-the-deleted-page behavior). No dropdown
    primitive exists anywhere in this codebase, so the menu is a small self-contained one built
    directly in `PageTreeNode.tsx`: a `relative`-positioned panel, closed on outside-click
    (`mousedown` listener) or `Escape`, mirroring `Modal.tsx`'s existing lightweight
    plain-`useEffect` style rather than pulling in a menu library.

    Verified via a Playwright spec exercising open/close (including click-outside), rename with
    Enter (saves) and Escape (reverts without saving), and delete with the confirm dialog accepted,
    plus the full 14-spec e2e suite, `pnpm check-types`/`lint`.

27. **Page editor toolbar cleanup: removed the redundant Delete button, added Undo/Redo.** ✅
    *done*, not yet merged to `master`. Two small, related changes to `PageEditor.tsx`'s toolbar:

    - Removed its own "Delete" button — redundant now that the sidebar's "⋯" menu (step 26) has
      the same action.
    - Added visible Undo/Redo buttons for discoverability. **Real finding**: `editor.can(cb)` —
      documented in BlockNote's own source comments as `if (editor.can(editor.undo)) { ... }` — is
      *not* actually public API on the installed `@blocknote/core@0.54.0`'s `BlockNoteEditor`
      class; only `undo()`/`redo()` are (confirmed against the package's own `.d.ts`, and its
      compiled source: `undo() { return this._stateManager.undo(); }` — `can()` only exists on
      that internal, untyped `_stateManager`). The correct fix was reading undo/redo depth
      directly off the underlying ProseMirror state via `@tiptap/pm/history`'s
      `undoDepth`/`redoDepth` (confirmed a straight re-export of `prosemirror-history` — `export *
      from 'prosemirror-history'` — so guaranteed to be the same module instance the editor
      already uses internally, avoiding a dual-package-instance mismatch that importing the bare
      `prosemirror-history` package separately could have risked), applied to
      `editor._tiptapEditor.state` (a public readonly property on `BlockNoteEditor`). Required
      adding `@tiptap/pm` as an explicit `apps/web` dependency, since pnpm's strict `node_modules`
      mode doesn't let a package import something only a dependency-of-a-dependency declares, even
      when it's already resolved in the store. Confirmed via the compiled source that `Mod-z` was
      already bound by default, so the keyboard shortcut worked before this change too — this only
      adds the missing visible/discoverable buttons, not the underlying capability.

    Verified via a Playwright spec confirming the Delete button is gone, both buttons start
    disabled on a fresh page, Undo enables after typing and Redo enables after undoing, and the
    reverted/reapplied content survives a reload (same autosave path, unchanged) — plus the full
    e2e suite, `pnpm check-types`/`lint`.

28. **"Update profile" box in the Account modal: name, occupation, bio, avatar.** ✅ *done*, not
    yet merged to `master`. Added a second box (alongside "Password") to `AccountModal.tsx`'s
    list-of-settings + drill-down pattern established in step 25 — proof that pattern scales the
    way it was meant to. New fields: first/middle(optional)/last name, an occupation dropdown
    (curated general-purpose list + "Other"), a bio, and a profile picture.

    - **New `profiles` table** — the first non-workspace-scoped table in this schema (see Data
      model above). `occupation` is stored as plain `text`, not an enum: the curated dropdown
      constrains the UI, but selecting "Other" (or loading a value that isn't in the current list)
      reveals a free-text input whose value saves directly into that same column — no second
      `occupation_other` column, and no schema change needed if the curated list changes later.
    - **RLS** mirrors `workspaces_update_owner`'s direct `id = auth.uid()` template rather than a
      membership join, since a profile has exactly one owner and no sharing concept. No delete
      policy — nothing deletes a profile row directly; `auth.users` cascade handles account
      removal.
    - **Auto-created on signup** via an `AFTER INSERT SECURITY DEFINER` trigger on `auth.users`
      (`handle_new_user_profile`), mirroring `handle_new_workspace`'s existing shape — reviewed by
      `rls-reviewer` before applying, which flagged that an unhandled insert failure inside the
      trigger would roll back the entire signup (a pre-existing gap in this same pattern, also
      present in the sibling `votero` repo, not a new one); addressed cheaply with
      `on conflict (id) do nothing` rather than a broader exception handler, since the only
      realistic re-fire risk is a double-insert race, not arbitrary failure. Pre-existing accounts
      (created before this migration) get no row from the trigger — the client's save path uses
      `upsert`, not `update`, so a pre-existing user's first save self-heals with no backfill
      script needed.
    - **New `avatars` Storage bucket**, public read like `page-images`, writes scoped to
      `(storage.foldername(name))[1] = auth.uid()::text` (the one deviation from `page-images`'
      workspace-membership scoping — this is user-scoped instead). Path is a **fixed filename per
      user** (`{userId}/avatar.webp`, not a random uuid), uploaded with `upsert: true` — every
      re-upload overwrites the same object in place rather than accumulating orphaned old avatar
      files with no cleanup mechanism, a real consideration against Storage's free-tier 1GB cap.
      Confirmed via direct `psql` against `storage.objects`: re-uploading twice for the same user
      still leaves exactly one row. **Real gotcha caught before it shipped**: a fixed path means
      the public URL never changes across re-uploads, so without a cache-buster the browser/CDN
      would keep serving the stale image after a change — `useUploadAvatar` appends `?v={timestamp}`
      to the returned URL to force a fresh fetch every time it changes.
    - Avatar upload reuses `PageEditor.tsx`'s existing compress-then-upload pattern
      (`browser-image-compression` → Storage), with a smaller `maxWidthOrHeight: 512` (vs. 1920 for
      page images) since an avatar never needs to be that large.

    Verified via `e2e/profile.spec.ts` (name/occupation/bio save and persist across a modal
    close+reopen, the "Other" occupation flow round-trips its custom value, avatar upload succeeds
    and a second upload overwrites the same object rather than duplicating — confirmed both via the
    UI and directly via `psql`), the full 15-spec e2e suite, `pnpm check-types`/`lint` (repo-wide,
    all 3 packages), and an `rls-reviewer` pass on all three new migrations before ever applying
    them locally.

29. **Username field + login-by-username.** ✅ *done*, not yet merged to `master`. Added an
    optional `username` to the "Update profile" box (step 28), and let the sign-in page's single
    identifier field accept either an email or a username.

    - **The forcing constraint**: Supabase's `signInWithPassword` only ever accepts `{ email,
      password }` or `{ phone, password }` — confirmed against `@supabase/auth-js`'s own types,
      never a username. A username has to be resolved to an email client-side, before the user is
      authenticated. Since this app's auth is deliberately 100% client-side (`AuthGate.tsx` — no
      `@supabase/ssr`, no server auth routes), that resolution has to be a database function
      callable by a signed-out (`anon`) client. **Confirmed with the user before building**: this
      is the first `anon`-callable RPC in this repo, and it's an accepted tradeoff that anyone who
      knows/guesses a username can resolve it to the account's email through this function. Kept
      as narrow as possible — `get_email_for_username(username) returns text`, a bare email-or-null,
      never a row/record, never distinguishing "no such username" from any other non-match.
    - **Schema**: `supabase/migrations/20260817000000_profile_username.sql` (nullable `username`
      column, `check (username is null or username ~ '^[a-z0-9_]{3,20}$')`, plain `unique`
      constraint — stored already-lowercased app-side so case-insensitive matching needs no
      `citext`/functional index) + `20260817000010_username_lookup_rpc.sql` (the `security
      definer` lookup function). Reviewed by `rls-reviewer` before applying — no blocking issues;
      confirmed the join can never fan out (unique constraint from migration 1 is in place before
      the RPC in migration 2 can rely on it), confirmed the `revoke all from public` + `grant ...
      to anon, authenticated` sequence is actually load-bearing here (unlike the existing trigger
      functions, which return `trigger` and are never directly callable regardless of grants, this
      one returns `text` and would otherwise be silently callable by `PUBLIC` by Postgres's
      default), and confirmed the CHECK constraint — not just the app's pre-lowercasing — is what
      actually prevents a non-lowercase username from ever being stored, regardless of what client
      code does.
    - **Sign-in page** (`apps/web/app/page.tsx`): the single identifier field became "Email or
      username" (`type="text"`, not `type="email"` — a username isn't email-shaped, so HTML5
      validation would block it), split into two pieces of state — `identifierInput` (exactly what
      was typed, what "Change" restores) and `email` (the resolved address auth calls actually
      use). Contains `"@"` → treated as an email directly, no RPC round-trip (keeps the common
      case exactly as fast as before). Otherwise resolved via the new `useEmailForUsername` hook;
      a `null` result shows "No account found with that username." and does *not* advance to the
      password step, since the magic-link fallback there also needs a real email to send to.
    - **`e2e/helpers.ts`'s shared `signIn` and `password-sign-in.spec.ts` both broke** from the
      `input[type="email"]` → `#identifier` change — every spec funnels through the shared helper,
      so this was caught immediately by the full suite rather than shipping unnoticed.

    Verified via a new `e2e/username-sign-in.spec.ts` (set a username, confirm an unknown username
    is rejected without reaching a password prompt, sign in successfully via the resolved
    username), plus ad-hoc checks (not made permanent): a second account attempting to claim an
    already-taken username sees "That username is already taken." rather than a raw Postgres
    error, and a network-level check confirming plain email sign-in never fires the lookup RPC at
    all. Full 16-spec e2e suite, `pnpm check-types`/`lint` (repo-wide), and the `rls-reviewer` pass
    above.

30. **Fixed BETA_READINESS.md item 1: silent autosave failures in Pages and Canvas.** ✅ *done*.
    `PageEditor.tsx`'s and `CanvasEditor.tsx`'s debounced `scheduleSave` called
    `updatePage.mutate(...)`/`updateCanvas.mutate(...)` with no `onError` and never read
    `.isError`/`.error`, so a failed autosave (expired session, RLS rejection, network drop) was
    silent — the user kept editing believing it had saved. `useUpdatePage`/`useUpdateCanvas`
    already exposed `.isError`/`.error` as standard `useMutation` return values, so this was a
    UI-only fix: both editors now render a small inline `text-red-700` message ("Couldn't save
    your last change: …") near the title while the mutation is in its error state, mirroring
    `CredentialDetail.tsx`'s existing `saveError` display pattern. No retry button/toast, and no
    change to the debounce/mutation structure — confirmed `apps/web/app/providers.tsx`'s
    `QueryClient` only sets `defaultOptions.queries.retry`, not `mutations.retry` (TanStack
    Query's own mutation default is `retry: 0`), so a failed autosave doesn't silently retry on
    its own and needed exactly this kind of visible signal. The error clears automatically on the
    next successful save, since a new `mutate()` call resets `isError`.

    Verified against a real local Supabase session (not just types/lint): signed in via magic
    link, created a workspace, created a page and a canvas, used Playwright's request
    interception to force the `PATCH /rest/v1/pages` and `PATCH /rest/v1/canvases` requests to
    fail, and confirmed the inline error rendered correctly in both editors. Plus
    `pnpm check-types`/`lint` (repo-wide).

31. **Fixed BETA_READINESS.md item 3: zero responsive/mobile layout.** ✅ *done*. No `sm:`/`md:`/
    `lg:`/`xl:`/`2xl:` breakpoints existed anywhere in `apps/web/app`, and no `@media` queries in
    `globals.css` — `Sidebar.tsx`'s hardcoded `w-64`, `PageEditor.tsx`'s fixed `px-8`/`pt-28`, and
    `CredentialsModal.tsx`'s side-by-side two-pane layout made the app effectively unusable at a
    ~375px phone width.

    - **Sidebar**: below `md`, `SidebarShell.tsx`'s desktop collapsed-rail/expanded-sidebar split
      is entirely `hidden`, replaced by an off-canvas drawer — a fixed `[aria-label="Open sidebar"]`
      toggle button, a `bg-black/50` backdrop, and the same `Sidebar` component sliding in from the
      left (its own `onCollapse` prop repurposed as "close the drawer" in this context). The drawer
      closes automatically on navigation via a `usePathname()` effect, rather than needing every
      nav link threaded with an explicit close callback. `mobileOpen` is deliberately *not*
      persisted to `localStorage` like the desktop `collapsed` flag — it's transient overlay state,
      not a layout preference.
    - **Editors**: `PageEditor.tsx`/`CanvasEditor.tsx` swapped their fixed padding for
      viewport-relative values (e.g. `px-4 pt-24 sm:px-8 sm:pt-28`) — the extra top padding is
      sized specifically to clear the fixed sidebar-toggle button, not arbitrary.
    - **`CredentialsModal`**: below `md`, switched to single-pane master/detail (list, or detail
      with a "← Back" row) rather than literal vertical stacking — the modal's fixed
      `h-[720px]`/`max-h-[85vh]` height meant stacking both panes would force double-scrolling
      inside a bounded box, worse than showing one pane at a time. `CredentialList.tsx`'s own root
      became `w-full md:w-72` to actually fill that single pane rather than staying pinned at 288px.
    - **Real bug found and fixed, outside the original audit's scope**: while implementing the
      above, found that several row-level actions across the app — `Sidebar`'s collapse button,
      `PageTreeNode`'s "add sub-page"/"⋯" menu buttons, `CredentialFolderTreeNode`'s folder action
      icons, and the workspace list's per-row Delete button — were `opacity-0`/`hidden` until
      `:hover`/`:focus-within`, with no touch equivalent for either state. On a touch device these
      were permanently unreachable, not just visually different — e.g. no way to rename or delete
      a page from the tree at all. Fixed the same way everywhere: `opacity-100`/`flex` as the base
      state, hover-reveal (`opacity-0`/`hidden` + `group-hover:`/`group-focus-within:`) pushed
      behind an `md:` prefix so it only kicks in once a real pointer device is likely present.

    Verified against a real local Supabase session using Playwright's `devices["iPhone 13"]`
    viewport emulation (not real touch input — see BETA_READINESS.md item 5's still-open real-device
    gap): walked through sign-in → create workspace → open the sidebar drawer → create a page → set
    up a vault → create, save, and navigate back from a credential on the emulated mobile viewport,
    screenshotting each step. Plus `pnpm check-types`/`lint` (repo-wide).

32. **Fixed BETA_READINESS.md item 5: added a WebKit e2e project, and two real bugs it found.**
    ✅ *done*. `playwright.config.ts` only ever configured `chromium` — no way to catch real
    Safari/WebKit-engine quirks in three dependencies with known iOS Safari history
    (`browser-image-compression`, `@excalidraw/excalidraw`, `@blocknote/mantine`). Added a
    `webkit` project (`devices["Desktop Safari"]`) and installed the browser binary
    (`playwright install webkit`, also added to the CI `e2e` job's install step).

    Running the full 16-spec suite against it cold surfaced two genuine, reproducible bugs — not
    environment flakiness, confirmed by isolating each down to a raw script and, for the second
    one, a direct `psql`/REST check bypassing the UI and test runner entirely:

    - **Real bug found and fixed: `e2e/helpers.ts`'s `signIn()` used `page.fill()` immediately
      after `page.goto("/")`.** `fill()` sets the DOM value and returns without waiting for React
      to attach its event handlers. On WebKit specifically, `goto()`'s `load` event reliably
      resolves *before* hydration finishes (confirmed: an identical instant `fill()` immediately
      after `goto()` left the identifier input empty 3/3 times in an isolated repro script,
      chromium's timing apparently doesn't expose the same window) — the fill lands, then gets
      silently wiped when the controlled `<input value={identifierInput}>` hydrates against its
      still-empty initial state. Fixed by switching to `click()` + `pressSequentially(email, {
      delay: 20 })`, which both closes the race (each keystroke lands well after hydration
      completes, confirmed 3/3 in the same repro) and is closer to how a real user actually types
      than an instantaneous fill.
    - **Real bug found and fixed: `AccountModal.tsx`'s `ProfileForm` could silently drop the first
      field a user typed.** Its seeding `useEffect` (`setFirstName(profile?.firstName ?? "")` etc.)
      ran every time the `profile` query's reference changed, including the query's own
      loading→resolved transition — so a user who started typing before that first resolution
      landed had their input overwritten back to the (still-empty, since it hadn't loaded yet)
      fetched value, and "Save profile" then persisted that overwritten value. Confirmed via
      direct `psql` against the local Postgres container: a test run that filled `firstName` first
      (immediately after the form mounted) then `middleName`/`lastName`/etc. right after produced
      a saved row with `middle_name`/`last_name` correct but `first_name` empty — only the very
      first field touched, right after mount, lost its value. A `seededRef` guard (fire the seed
      effect at most once) narrows the window but doesn't close it — the fields already exist
      (empty) the instant the form mounts, so a fast-enough first keystroke can still land before
      that one-time seed. Properly fixed by gating the form's fields out of the DOM entirely until
      `profile` has resolved (`if (profile === undefined) return <p>Loading…</p>`) — the seeding
      effect and the `seededRef` guard both stay, now as defense against a *later* background
      refetch stomping on in-progress edits, but the initial race is closed by construction: a
      keystroke can't land in a field that doesn't exist yet.

    **Known gap, not closed by this pass**: this is still emulated-viewport/mouse-driven WebKit,
    not a real Safari/iOS device — the doc's original "manually test on a real device/simulator"
    ask remains open, no such device was available here. A `devices["iPhone 13"]` mobile-viewport
    project was tried too, but 11 of 16 specs fail immediately since they assume the desktop
    sidebar is always visible (`[aria-label="New page"]` etc.) — below `md` it's off-canvas inside
    a drawer (step 31). Adapting the suite to open the drawer first on narrow viewports is real,
    separate work, not done here — left out of `playwright.config.ts` rather than landing a
    project that's 69% red by default.

    Verified via the full 16-spec suite on both `chromium` and `webkit` (32/32 green), the two
    fixed specs repeated 3x standalone against `webkit` with no flakes, and `pnpm
    check-types`/`lint` (repo-wide).

33. **Closed step 32's mobile-viewport gap: added a `mobile-safari` (`devices["iPhone 13"]`)
    project, and a real bug it found.** ✅ *done*. Step 32 tried this and abandoned it — 11 of 16
    specs failed immediately since they assumed the desktop sidebar/credentials-modal panes are
    always visible, but below `md` they're gated behind step 31's drawer/single-pane-detail UX.

    - **`e2e/helpers.ts` gained three exports**: `openSidebar(page)` (clicks the drawer toggle,
      gated on `page.viewportSize()!.width < 768` rather than an instant `toggle.isVisible()`
      check — same hydration-adjacent-race category as `signIn()` in step 32: checking visibility
      immediately after a fresh `goto()`/`reload()` can miss a toggle that hasn't rendered yet,
      where the viewport size is known synchronously before any content loads at all, so there's
      nothing to race), `backToList(page)` (clicks the credentials modal's mobile-only "← Back"
      row, via a bounded `waitFor` rather than instant `isVisible()` for the same reason, though
      the risk is lower there since it's never called immediately after a fresh navigation), and
      `onlyVisible(locator)` (`.and(page.locator(":visible"))`) — needed because `SidebarShell.tsx`
      keeps the desktop sidebar mounted (just `hidden md:flex`) even when the drawer is open, so a
      bare role/text locator matches *both* copies and Playwright's `.click()`/`expect()` default
      to the first (hidden) one in DOM order and hang. All three are no-ops on `chromium`/`webkit`
      (desktop viewports, single-pane-per-breakpoint) — existing desktop assertions needed no
      changes, only insertions at points that touch sidebar/credentials-list content.
    - Applied across `workspace-pages.spec.ts`, `canvas.spec.ts`, `publish-share.spec.ts`,
      `workspace-delete.spec.ts`, `workspace-isolation.spec.ts` (sidebar drawer) and
      `credential-folders.spec.ts` (credentials-modal single-pane) — one `openSidebar`/`backToList`
      call at *every* touch point, not just the first, since both close again after any navigation
      or (for the modal) returning to the list. `credentials.spec.ts`'s "Select a credential" check
      was replaced with checking the search input's visibility instead — that placeholder text is
      itself desktop-only (mobile shows the list directly rather than a side-by-side empty-state
      pane), so it was never a valid cross-viewport signal to begin with.
    - **Real bug found and fixed, in the test suite itself**: `canvas.spec.ts`'s shape-drawing step
      used fixed pixel offsets (`box.x + 700`, `box.y + 400`) sized for the desktop projects'
      ~1280px-wide viewport — on `mobile-safari`'s 390px-wide viewport those offsets land
      completely off-screen, so the "drag" never touched the canvas and `scene.elements` saved
      empty. Rewritten as fractions of the canvas's own `boundingBox()` (e.g. `box.width * 0.6`)
      so the same coordinates scale correctly to whatever viewport the project renders at —
      verified passing on all three projects.

    Verified via the full 16-spec suite on `chromium`, `webkit`, and `mobile-safari` (48/48 green),
    repeated a second time back-to-back to confirm no flakiness, plus `pnpm check-types`/`lint`
    (repo-wide). BETA_READINESS.md item 5's only remaining gap after this is the real-device part —
    no actual iOS Safari device/simulator was available in this environment to test on.

**Deferred, not started:** revisiting `PageEditor.tsx`'s image-compression settings against real
Storage usage — see **Next Up** above.
