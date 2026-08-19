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

**[docs/BETA_READINESS.md](BETA_READINESS.md) is now fully closed out, as of Build Order step 37**
— every finding from the original audit (silent autosave failures, no mobile layout, `Modal.tsx`
missing dialog semantics, no Safari/WebKit test coverage, read-hook errors, the Low-severity batch,
Storage orphaning on delete) is either fixed (steps 30-37) or explicitly accepted as non-blocking
risk (no application-level rate limiting; real iOS Safari device/simulator testing, given no device
was available to set that up). See that doc's own "Fixed"/"Accepted risk" sections for the detail
on each, and this file's Build Order steps 30-37 for the how/why of each fix.

No committed backlog beyond that audit exists right now — what to work on next is an open question
for whoever picks this up. A separate auth/IDOR/security-headers/input-validation audit ran after
BETA_READINESS closed out too, closed out as of Build Order steps 38-41 — check that before
re-auditing signup/RLS/security-header/input-limit territory. A follow-up UI/UX/performance audit
(pragmatic, personal-scale lens — not scored against a production-SaaS bar) ran after that; its
findings are closed out too, as of Build Order steps 42-49. Since then: the Credentials sidebar got
a visual redesign (step 50), and both sidebar trees (Pages, Credentials) gained full drag-and-drop —
reparenting (step 52) and sibling reordering (step 54). The one recurring (not one-time) item worth
keeping an eye on regardless: the image-compression settings in `PageEditor.tsx` against real
Storage usage as real data accumulates — Supabase Storage's free tier caps at 1GB.

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
  position, created_at, updated_at)` — `parent_id` self-references `pages` for the sidebar tree.
  `position` (`double precision`) is a manually-settable sibling order — see Build Order step 54.
- `credentials (id, workspace_id, folder_id, title, url, secret_ciphertext, secret_iv, position,
  created_at, updated_at)` — `title`/`url` plaintext (list view + search); `secret_ciphertext`/`secret_iv` are
  one AES-GCM ciphertext+iv pair encrypting a `{username, password, notes}` JSON payload per
  credential. See Build Order step 16. `folder_id` (nullable, `on delete set null`) places it in a
  `credential_folders` folder, or at root when null — see Build Order step 24. `position` (Build
  Order step 54) is scoped per `folder_id` group.
- `credential_folders (id, workspace_id, parent_folder_id, name, position, created_at,
  updated_at)` — pure containers (name only, no secret of their own), nesting arbitrarily deep via
  `parent_folder_id` (self-referencing, `on delete cascade` — unlike `credentials.folder_id`, which
  is deliberately `on delete set null` so deleting a folder never destroys the credentials inside
  it). Two triggers (`check_credential_folder_parent`, `check_credential_folder_workspace`) guard
  against cycles and cross-workspace linking, since RLS's flat per-row membership check can't catch
  either on its own. See Build Order step 24; `position` (per `parent_folder_id` group) is step 54.
- `canvases (id, workspace_id, title, scene jsonb, position, created_at, updated_at)` — flat, no
  `parent_id` (standalone items, not a tree like `pages`). `scene` is Excalidraw's own
  `{elements, appState}` shape; the `files` argument from Excalidraw's `onChange` (embedded image
  binaries) is never persisted. See Build Order step 17; `position` is step 54.
- **Manual ordering** (`position`, all four tables above, Build Order step 54): `double precision`,
  reordered via a client-computed midpoint between two neighbors
  (`packages/shared/src/lib/positionUtils.ts`) rather than an integer-with-gaps or
  fractional-indexing scheme — deliberately the simplest option that still supports O(1) reorders,
  accepted as fine at this app's realistic write volume (see that step for the
  float-precision-exhaustion tradeoff this implies).
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
    (repo-wide). BETA_READINESS.md item 5's only remaining piece after this — real iOS Safari
    device/simulator testing — was deliberately moved to that doc's "Accepted risk" section: no
    device was available here, and a paid device lab or a separate real-Safari CI toolchain
    (macOS runner + `safaridriver`/Appium) were both declined for now. The cheapest real coverage
    if it's ever wanted is manual: the live app at `https://delft.vercel.app` on an owned device.

34. **Fixed BETA_READINESS.md item 2: every read-hook consumer swallows errors.** ✅ *done*, the
    last remaining High-severity item in that doc. `useWorkspaces`, `usePages`, `useCredentials`,
    `useCanvases`, `usePage`, `useCanvas` were destructured as `{ data, isLoading }` only across
    all six consumer sites — a failed fetch (RLS error, network drop) looked identical to
    "genuinely empty" or "not found." Fixed by adding `isError`/`error` and an inline
    `text-red-700` branch alongside each site's existing loading/empty-state logic: `apps/web/app/
    workspace/page.tsx`, `Sidebar.tsx` (twice — Pages and Canvas sections), `CredentialsModal.tsx`
    (a standalone banner, doesn't gate vault-unlock UI), and the page/canvas route files. No hook
    changes — `.isError`/`.error` were already standard `useQuery` return values, this was purely a
    UI-consumption gap.

    **Verification note worth keeping**: a first pass at forcing each read to fail
    (`page.route(...).abort("failed")` + a few seconds' wait, the same technique that worked for
    step 30's mutation-error check) came back all-negative — every banner showed 0 matches. Traced
    it to timing, not a code bug: in local `next dev`, a forced query failure took **15-20 seconds**
    to actually settle into `isError`, well past `providers.tsx`'s nominal `retry: 1` — request
    logging showed far more than 2 failed attempts before it gave up, consistent with React
    StrictMode's dev-only double-invoke compounding the retry count. Mutations (step 30) don't hit
    this since `defaultOptions` only sets `queries.retry`, not `mutations.retry` — that's why the
    same short-wait technique worked there but not here. Re-verified with `page.waitForSelector`
    (no fixed timeout) instead of a blind wait, and all six sites confirmed rendering correctly.
    Plus `pnpm check-types`/`lint` (repo-wide).

35. **Fixed BETA_READINESS.md item 4: `Modal.tsx` has no dialog semantics.** ✅ *done*, closing out
    Medium severity. Neither the backdrop nor the panel had real dialog semantics (both
    `role="presentation"`, the panel's wrong for a dialog container), no focus trap, no
    focus-in-on-open/focus-return-on-close — Tab could escape the modal into the page behind it.
    All three consumers (`AccountModal.tsx`, `CredentialsModal.tsx`,
    `MoveCredentialFolderModal.tsx`) share one `Modal.tsx` primitive, so the fix is confined to
    that one file.

    - Panel gets `role="dialog"` + `aria-modal="true"` (backdrop keeps `role="presentation"` — it's
      a decorative click-to-close overlay, not part of the dialog).
    - Focus trap is a manual Tab/Shift+Tab handler on the existing `keydown` listener, not
      `inert`-ing siblings — considered and rejected, since `document.body`'s children include
      *every* open modal's own portal (`MoveCredentialFolderModal` opens from inside
      `CredentialsModal`), and `inert`-ing "everything except this one" would need to specifically
      exclude every other currently-open portal too.
    - A `useEffect` keyed on `open` moves focus to the panel's first focusable element (or the
      panel itself, `tabIndex={-1}`, as a fallback) on open, and back to whatever
      `document.activeElement` was beforehand on close.
    - **Real bug found and fixed during verification, not just eyeballing the diff**: the first
      pass guarded the Tab-wrap logic against the nested-modal case (`panel.contains
      (document.activeElement)` before acting) but left Escape unguarded. Every open `Modal`
      instance registers its own `window`-level `keydown` listener — native listeners have no
      concept of nesting, so *all* open instances' listeners fire on every keydown regardless of
      which modal actually has focus. One Escape press was closing both the inner
      `MoveCredentialFolderModal` and the outer `CredentialsModal` at once. Caught by an actual
      nested-modal Playwright script (open Credentials → create a folder → open its Move dialog →
      Escape → assert exactly one `[role="dialog"]` remains, not zero) — a check the first "looks
      right" implementation would have failed. Fixed by moving the focus-containment guard above
      the Escape/Tab branch entirely, so only the instance that actually owns focus reacts to
      either key.

    Verified against a real local Supabase session: `role="dialog"`/`aria-modal="true"` present on
    open; focus lands inside the panel immediately (on the Close button) without an explicit call;
    15 forward Tabs and 5 Shift+Tabs never escape the panel; Escape closes and returns focus to the
    trigger. Nested case reverified after the fix: Tab stays within the innermost dialog only, and
    Escape closes just that one. Plus the full 48-test suite (`chromium`/`webkit`/`mobile-safari`)
    green with no regressions, and `pnpm check-types`/`lint` (repo-wide).

36. **Fixed BETA_READINESS.md's Low-severity batch: title `<label>`, favicon, `app/error.tsx`, OG/
    viewport metadata.** ✅ *done*, closing out every High/Medium/Low item in that doc except
    Storage orphaning. Four small, independent gaps fixed together in one pass:

    - `PageEditor.tsx`/`CanvasEditor.tsx`'s title inputs relied on `placeholder="Untitled"` alone —
      each now has an `sr-only` `<label htmlFor>` paired to a new `id` (`page-title`/
      `canvas-title`) on the input.
    - No favicon anywhere — `apps/web/app/icon.tsx` generates one at request time via Next's
      built-in `next/og` `ImageResponse` (Next's file-based icon convention: the file's default
      export becomes the `/icon` route automatically, no manual `<link rel="icon">` needed). A
      plain "D" monogram (ink-800 background, paper-50 text) rather than a designed logo, since
      there isn't one yet — zero-cost, no external asset or service.
    - No `app/error.tsx` anywhere — added both a root one and one scoped to `app/workspace/`
      (per the doc's own suggestion, since that's where the state-heavy editors live): Next's
      file-based error boundary convention, replacing just the segment that threw while parent
      layouts (the workspace TopBar) stay mounted. Both render a "Something went wrong."
      message + `reset()`-wired "Try again" button, plus a `console.error` for dev visibility.
    - No OG/Twitter/viewport metadata — root `layout.tsx` gained `openGraph`/`twitter` fields on
      the existing `metadata` export and an explicit `viewport` export; `share/[slug]/page.tsx`
      (the one route meant for external sharing) gained a `generateMetadata` using the shared
      page's own title, so a share URL sent around actually gets a real link preview instead of
      the generic site-wide one. That's a second, smaller Supabase query beyond the page
      component's own fetch — different `.select()` columns mean Next's request memoization
      won't dedupe the two — accepted as a minor cost rather than engineering a shared cached
      fetch for one route.

    Verified against a real local Supabase session, not just written and assumed correct: both
    title labels confirmed via `page.getByLabel("Title")` resolving to the actual input; the
    favicon confirmed by fetching `/icon` directly (200, `image/png`, visually inspected as the
    intended monogram — not just assumed from the route existing); both error boundaries confirmed
    by *forcing a real render-time throw*, not just reading the code. The root one was
    straightforward (a temporary always-throwing route, no auth involved). The workspace-scoped
    one needed a different approach: a temporary throwing route at `app/workspace/test-error-
    trigger/` redirected to the sign-in page instead of showing the error, traced to `AuthGate`
    racing its own session-reestablishment against a full `page.goto()` reload — a real
    characteristic of this app's client-side-only auth, but not a bug in `error.tsx` itself, and
    not representative of how a real user would ever hit this (mid-session, not a cold load to a
    URL that happens to throw). Switched to triggering the throw via a temporary click-driven state
    change on an already-authenticated, already-mounted page instead, which sidesteps the
    reload race entirely — confirmed the boundary renders and "Try again" successfully resets back
    to real content. All temporary test files/routes/edits removed afterward, confirmed via a clean
    `git diff` before committing.

    Plus `pnpm build` (confirms the `/icon` route and both `generateMetadata`/`viewport` exports
    actually compile, not just type-check), `pnpm check-types`/`lint`, and the full 48-test e2e
    suite (`chromium`/`webkit`/`mobile-safari`) green with no regressions.

37. **Fixed BETA_READINESS.md's last item: Storage orphaning on page/workspace delete.** ✅ *done*
    — this closes out every finding in that audit doc. `useDeletePage`/`useDeleteWorkspace`
    (`packages/shared/src/hooks/`) only ever deleted Postgres rows (`on delete cascade` handles the
    relational side for free); neither called `supabase.storage.from("page-images")
    .remove(...)`, so any BlockNote-uploaded image became permanently orphaned once its page or
    workspace was deleted — a slow, one-way leak against the 1GB free tier.

    - **New shared helper**: `packages/shared/src/lib/removePageImages.ts` (mirroring the existing
      `lib/workspaceUrl.ts` precedent for a plain non-hook utility, not added to the package's
      public `index.ts` since it has no consumer outside these two hooks) — `list()`s each given
      page ID's `{workspaceId}/{pageId}` prefix and batches everything found into one `remove()`
      call. **Best-effort by design**: caught and logged via `console.error` rather than rethrown
      — this is a slow-leak concern, not a correctness requirement, and blocking a user from
      deleting a page/workspace they want gone over a transient Storage hiccup would be a worse
      tradeoff than occasionally leaving an object behind (the exact failure mode the audit finding
      itself already called "not catastrophic short-term").
    - **Ordering matters and is easy to get backwards**: both hooks call the helper *before* their
      row delete, not after. `page_images_delete_member`'s RLS
      (`supabase/migrations/20260812140030_storage.sql`) scopes `list()`/`remove()` on the caller
      still being a member of the workspace named by the object path's first segment — a completed
      `workspaces` row delete cascades `workspace_members` away too, so any Storage call attempted
      *after* that point would already be locked out by RLS regardless of who's calling.
    - **`useDeletePage` needed the whole descendant subtree, not just the one page ID passed in**
      — deleting a page cascades every sub-page under it (`on delete cascade` on
      `pages.parent_id`, already documented in that hook's own pre-existing comment), and Storage
      paths have no concept of a page hierarchy to resolve that automatically. Reused `Sidebar.tsx`'s
      own established pattern for exactly this shape of problem (fetch all of a workspace's
      `{id, parent_id}` pairs in one query, build the tree client-side) rather than adding a new
      recursive-descendant RPC — unwarranted extra migration surface at this app's personal scale.
    - `useDeleteWorkspace` needed the simpler version: no tree to walk, just every page ID in the
      workspace.

    Verified against a real local Supabase session, not just written and assumed correct: uploaded
    fake images directly via the Storage REST API to a parent page and a child sub-page's exact
    path convention, confirmed both existed via a direct `list()` call, deleted the *parent* page
    through the UI (page-tree "⋯" menu, which cascades the child too), and confirmed *both*
    objects were gone — proving the subtree-cascade case specifically, not just a trivial
    single-page delete. Repeated the same shape for a whole-workspace delete (image in a page,
    delete the workspace from the switcher) and confirmed the object was gone there too. Along the
    way, hit the same `AuthGate`-vs-full-reload race documented in step 36 while trying to navigate
    to the workspace switcher via `page.goto()` — worked around identically, by navigating via a
    client-side link click instead. Plus `pnpm check-types`/`lint` (repo-wide) and the full
    48-test e2e suite (`chromium`/`webkit`/`mobile-safari`) green with no regressions — neither
    `workspace-delete.spec.ts` nor `canvas.spec.ts`'s existing delete flows assert on Storage
    state, so this also confirmed the added Storage calls introduced no new failure mode in the
    delete mutations themselves.

**Deferred, not started:** revisiting `PageEditor.tsx`'s image-compression settings against real
Storage usage — see **Next Up** above.

38. **Auth security audit.** ✅ *done*. Requested review of password hashing, session expiry, email
    verification, password-reset token expiry, login rate limiting, and frontend secret exposure.
    Audited every hook in `packages/shared/src/hooks/` plus `AccountModal.tsx` and confirmed auth is
    100% delegated to Supabase/GoTrue — no custom password hashing, token generation, or session
    logic exists in app code, and no service-role key or other secret is ever referenced in
    browser-shipped code (only the public anon key, in `providers.tsx` and `share/[slug]/page.tsx`).
    So there was no insecure custom logic to refactor; the actual gaps were three under-tuned GoTrue
    config values in `supabase/config.toml`:
    - `minimum_password_length`: `6` → `8`
    - `password_requirements`: `""` (no character-class rule) → `"lower_upper_letters_digits"`
    - `secure_password_change`: `false` → `true` (password changes now require a recent
      login/reauth — relevant because `useSetPassword` lets any active session silently add
      password sign-in with no re-auth check)

    Confirmed everything else already met the bar and was deliberately left unchanged:
    `jwt_expiry = 3600` with `enable_refresh_token_rotation = true` (session expiry), GoTrue's
    built-in `[auth.rate_limit]` block (login throttling — no custom app-level throttling exists or
    is needed on top of it), and `enable_confirmations = false` (email verification) — account
    *creation* is magic-link-only (no `auth.signUp` call exists anywhere in the repo), so receiving
    the magic link *is* the verification step, making this correct by design rather than a gap.
    Password reset likewise has no separate flow or custom token logic — a failed password attempt
    falls back to the same magic link (step 14), governed by the same `otp_expiry = 3600`.

    Updated `e2e/password-sign-in.spec.ts` and `e2e/username-sign-in.spec.ts`'s fixture password to
    `Correct-Horse-Battery9` (was `correct-horse-battery`, all-lowercase) so both still satisfy the
    new complexity rule; `e2e/credentials.spec.ts`'s identical-looking string is an unrelated
    Credentials-Manager test fixture, not a Supabase auth password, and was left alone. Verified by
    restarting the local stack (`supabase stop && supabase start`, so `config.toml` was re-read) and
    running both specs across all three e2e projects (chromium/webkit/mobile-safari) — 6/6 passed.

    **Hosted-side action item, not yet done**: per step 18's `config push` decision, these three
    values only apply to local dev — the hosted project's Auth settings are Dashboard-only and were
    not touched here. To match, set them by hand under Dashboard → Authentication → Providers →
    Email (minimum password length 8, password requirements "Lowercase, uppercase letters and
    digits") and → Authentication → Policies (require reauthentication before password change).

    **Recommended follow-up, not implemented**: a CAPTCHA (`[auth.captcha]`, hCaptcha or Cloudflare
    Turnstile, both free) as brute-force protection beyond GoTrue's IP rate limits. Needs the user's
    own Turnstile/hCaptcha site key (an external account action) plus wiring a widget into the
    sign-in/sign-up forms — out of scope for a config-only pass.

39. **IDOR audit of every RLS policy, then a deployment-security pass (HTTPS headers, secrets,
    direct DB access, logging).** ✅ *done*, two separate requests handled back to back.

    **IDOR audit**: since there are no custom `app/api/**` routes at all — the browser talks
    straight to PostgREST/GoTrue/Storage with the anon key — the entire IDOR trust boundary here is
    RLS, not application code. Re-read every policy across all 17 migrations (`rls-reviewer` agent
    pass, then independently re-verified `20260812140010_rls.sql` and
    `20260812181920_credentials_rls.sql` by hand rather than trusting the agent's report at face
    value) — found **zero IDOR vulnerabilities**. Every table (`workspaces`, `workspace_members`,
    `pages`, `credentials`, `credential_folders`, `canvases`, `profiles`) has RLS enabled with all
    four operations correctly scoped to `auth.uid()` via direct ownership or a `workspace_members`
    membership subquery; the two deliberate anon-reachable exceptions
    (`pages_select_published_anon`, `get_email_for_username`) are both narrowly scoped to exactly
    what they need. Storage bucket policies (`page-images`, `avatars`) correctly key writes off the
    caller's own workspace-membership or user-id path prefix. No code changes were needed — this
    was a verification pass, not a fix.

    **Deployment security pass**:
    - **HTTPS**: Vercel already TLS-terminates and redirects HTTP→HTTPS at the edge for
      `*.vercel.app` by default (nothing to configure), but the repo had zero security-headers
      config. Added an `async headers()` block to `apps/web/next.config.js` applying
      `Strict-Transport-Security` (HSTS, 2yr + `includeSubDomains` + `preload` — meaningfully
      different from Vercel's redirect: it stops the browser from ever attempting plain HTTP again,
      closing the downgrade-on-first-request gap that a redirect-after-the-fact doesn't cover),
      `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (safe — confirmed zero `<iframe>`
      usage anywhere in `apps/web`; Google sign-in is a popup, not an embed), `Referrer-Policy:
      strict-origin-when-cross-origin`, and a `Permissions-Policy` denying camera/mic/geolocation
      (unused by the app). Verified live: `curl -D -` against the dev server showed all five headers
      present, then the full `chromium` e2e suite (16/16, including sign-in flows) still passed with
      headers active, confirming nothing broke. A full CSP was considered and deliberately **not**
      added in this pass — Turbopack/BlockNote/Excalidraw/Supabase asset origins would need careful
      allowlisting and live verification to avoid silently breaking something in production, which
      is a separate, riskier piece of work.
    - **Secrets**: re-confirmed the findings already on record from step 38 — `.gitignore` excludes
      all `.env*` variants except the committed `.env.local.example`/`.env.example` placeholder
      templates (verified via `git log --all --diff-filter=A -- '*.env*'`: only the two placeholder
      files were ever added, never a real `.env.local`), only `NEXT_PUBLIC_*` vars are defined for
      the client, and every non-placeholder `env(...)` reference in `supabase/config.toml` resolves
      to a real environment variable rather than a hardcoded value. No changes needed.
    - **Direct DB access**: confirmed no code anywhere in the repo connects directly to Postgres
      (`pg`/`node-postgres`/`DATABASE_URL`/raw connection strings) — all access is via the Supabase
      client over HTTPS (PostgREST). Restricting the hosted project's direct Postgres port from the
      public internet (Dashboard → Settings → Database → Network Restrictions, if available on the
      free tier) and confirming "Enforce SSL on incoming connections" is on are both Dashboard-only
      settings this session can't perform or verify — flagged as a manual action item for the user,
      not attempted.
    - **Logging**: asked the user directly rather than assuming — declined adding a third-party
      error tracker (e.g. Sentry free tier) to avoid a new external dependency at personal-project
      scale, choosing instead to rely on Supabase's existing free Auth/API logs and Vercel's existing
      free deploy/function logs (Dashboard → Logs on each platform) when investigating an incident.
      `apps/web/app/error.tsx`'s existing `console.error` + fallback UI (step 36) was left as-is.

40. **Abuse-protection scoping: no custom API/AI surface exists, so the work narrows to the one
    public route.** ✅ *done*, scoped down with the user rather than built blind. The request asked
    for rate limiting on "login attempts, API endpoints, account creation, and AI generation
    requests" — none of the last three exist in this app (no `app/api/**`, no AI feature anywhere),
    and login/account-creation rate limiting is already GoTrue's built-in `[auth.rate_limit]` (tuned
    in step 38). Confirmed with the user that the only real gap is `/share/[slug]`
    (`apps/web/app/share/[slug]/page.tsx`) — the sole unauthenticated, publicly fetchable route,
    with zero bot/scraper protection.

    Real distributed rate limiting there needs state shared across requests, which Vercel serverless
    functions don't have on their own (a naive in-memory counter resets on every cold start/scale-out
    and wouldn't actually stop a scraper) — the standard fix is an external store like Upstash Redis.
    Asked the user whether to add that new (free-tier) third-party dependency; they chose
    **best-effort only, no new service**. Implemented the two zero-dependency mitigations available:
    - `apps/web/app/robots.ts` (Next's file-based robots.txt convention, same pattern as the
      existing `icon.tsx`): disallows `/share/` and `/workspace/` for all user agents. Verified via
      `curl http://127.0.0.1:3000/robots.txt`.
    - `/share/[slug]`'s `generateMetadata` now also returns `robots: { index: false, follow: false }`
      — belt-and-suspenders for bots that fetch the page but don't honor `robots.txt`.
    - Confirmed (not changed — already correct) `usePublishPage.ts`'s `generateSlug()` uses 12 hex
      chars of `crypto.randomUUID()` (48 bits of randomness), already documented as a deliberate
      "unguessable enough for personal sharing, not meant to resist targeted brute-forcing"
      tradeoff — left as-is.

    Both are advisory-only against a determined, non-compliant scraper — real bots ignore
    `robots.txt` outright — but they stop the well-behaved-crawler case (search engine indexing of
    personal shared content) at zero cost and zero new infrastructure, which is what was in scope
    after the user declined the Upstash option. Verified: `pnpm check-types`/`lint` clean, and
    `publish-share.spec.ts` still passes with the new metadata in place.

41. **Input-validation audit: mapped every user-input entry point, then closed the two real gaps
    found.** ✅ *done*. Asked for SQL/command/script-injection and unsafe-upload protection across
    every form, upload, and query param. Found **no SQL injection surface** (zero raw SQL
    string-building anywhere — every DB call goes through the parameterized Supabase client, and
    the sole `.rpc()` call passes a typed args object), **no command injection surface** (zero
    `child_process`/`exec`/`spawn` in app code), and **no XSS surface** (zero
    `dangerouslySetInnerHTML` anywhere; BlockNote page content is stored as structured `jsonb` and
    always rendered through BlockNote's own block components, both in the editor and the public
    `/share/[slug]` reader — never as raw HTML). No sanitization library was needed because there's
    no raw-HTML rendering path to sanitize in the first place.

    Two real gaps did exist, both because this app's only trust boundary is Postgres/Storage
    itself (no server sits between the client and Supabase, so the client can always be bypassed):
    - **New migration `20260818000000_storage_upload_limits.sql`**: `page-images` and `avatars`
      Storage buckets had no `file_size_limit`/`allowed_mime_types` at all — the only thing
      stopping an oversized or non-image upload was the app's own client-side
      `browser-image-compression` step, trivially skippable by hitting the Storage API directly
      with a valid session. Set both to `file_size_limit = 5242880` (5 MiB) and
      `allowed_mime_types = image/webp, image/png, image/jpeg` — no `image/svg+xml`, since both
      buckets are public-read and an uploaded SVG can embed `<script>`.
    - **New migration `20260818000010_text_length_limits.sql`**: several free-text columns had no
      length limit at the DB level, even though the codebase already had the right pattern in two
      places (`workspaces.name`'s `check (char_length(name) between 1 and 200)` from `init.sql`,
      and `profiles.username`'s regex-format check). Extended the same pattern to `pages.title`
      (≤500), `credentials.title` (≤200), `credentials.url` (≤2000), `credential_folders.name`
      (≤200), `canvases.title` (≤200), and `profiles.first_name`/`middle_name`/`last_name` (≤100
      each), `occupation` (≤200), `bio` (≤2000) — each its own `add constraint` so one column's
      violation can't block the others. Deliberately **not** applied to
      `credentials.username`/`password`/`notes`: those are client-side AES-GCM ciphertext bundled
      into `secret_ciphertext`, so the server never sees that plaintext and there's nothing
      meaningful to length-check.

    Added matching `maxLength` to every corresponding input (workspace name, page title, canvas
    title, credential title/URL, folder rename, page rename, and the profile name/occupation/bio
    fields in `AccountModal.tsx`) — UX only, not the real enforcement, so users hit normal browser
    truncation instead of a raw Postgres constraint-violation error.

    Verified thoroughly: `npx supabase db reset` applied both migrations cleanly against existing
    seed data; queried `storage.buckets` and every table's `\d` output directly via
    `docker exec supabase_db_delft psql` to confirm the limits/constraints actually landed (not
    just assumed from the migration file); `pnpm check-types`/`lint` clean; the full `chromium` e2e
    suite (16/16, including `profile.spec.ts`'s real avatar upload) still passed with the new
    Storage restrictions live, confirming the happy path wasn't broken by the new limits.

42. **QueryClient staleTime.** ✅ *done*. `apps/web/app/providers.tsx`'s shared `QueryClient` had no
    `staleTime`/`refetchOnWindowFocus` override, so all 34 hooks in `packages/shared/src/hooks/`
    refetched on every component remount and every window refocus — including the full unbounded
    page/canvas/credential list queries. Set `staleTime: 30_000` and `refetchOnWindowFocus: false`
    on the shared defaults; no per-hook changes needed since none override `staleTime` themselves.
    Verified: `pnpm check-types`/`lint` clean.

43. **Sidebar/credentials tree re-render fan-out.** ✅ *done*. `PageTreeNode.tsx` and
    `CredentialFolderTreeNode.tsx` re-rendered their entire visible subtree on every single
    expand/collapse click, because the `expanded` state is a `Set<string>` that gets a fresh
    reference every toggle (`new Set(prev)`), passed straight down through every recursive tree
    level with no `React.memo` anywhere to stop the cascade. Split a per-node `isExpanded: boolean`
    out from the raw `expanded: Set<string>` prop (each node still receives the Set, but only to
    compute its own children's booleans when recursing), wrapped both components in `memo()` with a
    custom comparator that deliberately excludes `expanded` from the equality check, and stabilized
    the `toggle`/`createChild`/`handleNewFolder`/`handleNewCredential`/`startRename`/
    `handleDeleteFolder` callbacks feeding them (`Sidebar.tsx`, `CredentialList.tsx`,
    `CredentialsModal.tsx`) with `useCallback` — a memoized child still re-renders every time if its
    callback props are fresh closures every parent render. `commitRename` specifically needed a
    ref-based rewrite rather than a plain `useCallback`, since it closes over `renameValue` (which
    changes every keystroke) and is threaded unconditionally into every tree node — a naive
    dependency array would have reopened the exact same fan-out, just gated on renaming instead of
    expanding. Verified: `pnpm check-types`/`lint`/`build` clean; 12 e2e tests
    (`workspace-pages.spec.ts`, `credential-folders.spec.ts`) passing across
    Chromium/WebKit/Mobile Safari, confirming rename/create/delete/expand behavior is unchanged.

44. **`VaultKeyContext` provider value memoization.** ✅ *done*. `packages/shared/src/vault/
    VaultKeyContext.tsx`'s provider wraps the entire authenticated app (mounted in
    `apps/web/app/workspace/layout.tsx`), but its context value — `{ isUnlocked, getKey, unlock,
    setKey, lock }` — was a fresh object literal every render even though the individual methods
    were already correctly wrapped in `useCallback`. That re-rendered every `useVaultKey()` consumer
    on any change to the provider, regardless of whether their own workspace's unlock state
    actually changed. Wrapped the value object itself in `useMemo`. No public API change —
    `useVaultKey`/`VaultKeyProvider`'s signatures are untouched, so `CredentialsModal.tsx`,
    `VaultUnlockPanel.tsx`, and `workspace/layout.tsx` needed no changes. Verified: `pnpm
    check-types`/`lint` clean; 18 e2e tests (`credentials.spec.ts`, `credential-folders.spec.ts`)
    passing across 3 browsers.

45. **Share-page double-fetch dedup.** ✅ *done*. `/share/[slug]` — the app's one server-rendered
    route — ran two separate Supabase queries per hit for the same row: `generateMetadata()`
    (`select("title")`) and the page body (`select("title, content, updated_at")`). Next's request
    memoization doesn't dedupe across differing `.select()` column lists, so this was a real
    double-fetch on every hit, already flagged as such in the code's own comment. Extracted the
    fetch into `apps/web/app/share/[slug]/_lib/getSharedPage.ts`, wrapped in React's `cache()` (keyed
    on `slug`), fetching the full column set once so both call sites share one query per request —
    `generateMetadata()` just reads `title` off the same shared result rather than issuing a
    second, narrower query. Verified: `pnpm check-types`/`lint`/`build` clean; `publish-share.spec.ts`
    passing across 3 browsers.

46. **Bundle-size visibility.** ✅ *done*, after a false start. Wired up `@next/bundle-analyzer` in
    `next.config.js` per a standard recommendation, then discovered on testing that it only
    instruments webpack builds and is explicitly incompatible with Turbopack — which is this app's
    default builder in Next 16 for both `dev` and `build`. It silently printed "no report will be
    generated" instead of actually analyzing anything, which would have shipped a devDependency
    that looked wired up but never worked. Reverted `next.config.js`, removed the dependency before
    it ever landed in a commit, and used Next's own Turbopack-native `next experimental-analyze`
    instead — exposed as `pnpm analyze` in `apps/web/package.json`. Zero extra dependency; confirmed
    with a real run that it writes an analysis to `.next/diagnostics/analyze`.

47. **Branch-discipline guardrail: a `PreToolUse` hook blocking `git commit`/`git push` on
    `master`.** ✅ *done*. This repo's workflow is develop → PR → `master` (`master` auto-deploys to
    production on push), but this session committed 5 fixes directly to `master` by mistake before
    catching it and moving them to `develop` (stash + cherry-pick + reset — nothing had been pushed,
    so this was fully local). `.claude/hooks/block-master-git-writes.js` + `.claude/settings.json`
    now check the current branch before any Bash/PowerShell `git commit`/`git push` and deny it with
    a clear message if the branch is `master`. Verified via pipe-tests against synthesized hook
    input and a live sentinel-file test confirming it actually fires.

48. **Touch/click target audit fix: `TopBar`, `ThemeToggle`, `Sidebar`, `PageTreeNode` icon
    buttons.** ✅ *done*. Several buttons were well under the ~44px comfort floor (down to 16×16 for
    the tree-row buttons). Added an invisible `before:absolute` pseudo-element to each, extending
    the clickable area past the visible edges with no layout shift — asymmetric per button, not a
    uniform inset, since several sit only 4-8px from another interactive neighbor (a sibling button,
    or `PageTreeNode`'s title `Link`) that a uniform expansion would have stolen clicks from. Only
    the two standalone `TopBar` buttons reach the full 44×44; every other button is capped short on
    at least one axis by a real neighbor, the correct outcome given the layout.

49. **Route-level `loading.tsx` for the page and canvas editor routes.** ✅ *done*. Both routes are
    client components that only showed a loading state once mounted and their own query had
    started, leaving a blank flash during the route-transition/hydration gap.
    `apps/web/app/workspace/[workspaceSlug]/p/[pageId]/loading.tsx` and the matching
    `canvas/[canvasId]/loading.tsx` fill that gap via Next's built-in Suspense convention, reusing
    each route's own already-existing loading markup.

50. **Credentials vault modal redesign.** ✅ *done*. The sidebar tree and detail pane read as
    generic/unpolished against the rest of the app. Switched every hand-rolled inline SVG icon
    (including a bare unicode chevron glyph) to `lucide-react` — already used everywhere else in the
    app, the biggest single consistency gap — added a ghost icon-button pattern for utility actions
    (Copy/Show/Generate, folder-row hover actions) replacing a bordered-box-with-text-label look, a
    `KeyRound` icon on credential rows so they read consistently with folders' own icon,
    `font-medium` folder names, and an accent-colored left bar on the selected row so selection is
    unambiguous at a glance. Kept the Show/Hide password button's `aria-label` as exactly
    `"Show"`/`"Hide"` (matching its previous visible text) since `credentials.spec.ts` targets it by
    accessible name — going icon-only without that would have silently broken the test.

51. **Fix: broken expand/collapse on nested sidebar/folder-tree rows — a regression from step 43.**
    ✅ *done*. Step 43's re-render optimization excluded the raw `expanded: Set<string>` from each
    node's memo comparator, relying instead on a separately-passed `isExpanded` boolean computed by
    each node's *parent* during the parent's own render — so whenever the parent's own `isExpanded`
    looked unchanged, its memo check skipped re-rendering it, which also skipped recomputing
    `isExpanded` for any of its children (only ever done inside the parent's render). Toggling
    anything below the root level silently did nothing unless some unrelated change happened to
    force the parent to re-render anyway — reported directly ("sub folder is hard to click... can't
    minimize", then "same thing on the main sidebar"). Reverted to computing `isExpanded` internally
    from a normally-compared `expanded` prop in both `PageTreeNode.tsx` and
    `CredentialFolderTreeNode.tsx` — gives up step 43's "skip re-render on an unrelated toggle"
    optimization (a scale this app hasn't reached yet) in favor of correctness. Added regression
    tests to `workspace-pages.spec.ts`/`credential-folders.spec.ts` that toggle a nested (non-root)
    row via a plain click with no accompanying data change — the exact path the existing tests never
    exercised, which is how this shipped unnoticed. Verified by temporarily reintroducing the bug:
    the new test fails immediately, and passes again once reverted.

52. **Drag-and-drop reparenting: pages sidebar + credentials folder tree.** ✅ *done*. Pages and
    credential folders can now be dragged onto another item to reparent them, or onto a root drop
    target to move back to the top level — requested directly ("should be drag and drop only if we
    want to move folders on credentials and pages... part on sidebar"). `CredentialsModal`'s old
    "Move" button and its dropdown-based `MoveCredentialFolderModal.tsx` are gone entirely — drag is
    now the only way to move a folder, matching pages (which never had a move mechanism at all
    before this). Used `@dnd-kit/core` (Pointer Events, not native HTML5 drag-and-drop, which has
    well-known unreliable touch support — this app's e2e suite runs a real `mobile-safari` project,
    see step 33). Both trees share one activation constraint and `pointerWithin` collision detection
    (checks actual cursor position; the default `rectIntersection` was ambiguous for adjacent,
    closely-packed rows and picked the wrong target in WebKit). A real safety gap was closed along
    the way, not just a UI feature: `pages.parent_id` had zero server-side cycle-prevention before
    this (unlike `credential_folders`, which got one specifically because "move a folder" needed it
    — see step 24's migration). New `pages_check_parent` trigger
    (`supabase/migrations/20260818140000_pages_check_parent.sql`) mirrors it — self-parent, cycle,
    and cross-workspace checks — verified directly via `psql`, not just assumed correct from the
    SQL. New shared `packages/shared/src/lib/treeUtils.ts`'s `computeSubtreeIds` (ported from the
    deleted modal's own exclusion logic) backs both trees' "can't drop onto my own descendant" UI
    guard.

53. **Fix: drag-and-drop never activated for real mouse users.** ✅ *done*. Step 52 shipped both
    trees on a single `PointerSensor` with a 200ms-delay + 8px-tolerance activation constraint
    (chosen so touch-scrolling inside the credentials list's `overflow-y-auto` container kept
    working) — that constraint requires holding the pointer still for the full delay before any
    movement is allowed, so an ordinary "click and immediately drag" gesture moves well before 200ms
    elapses, cancelling the drag instead of starting it. Reported directly ("I can't drag and
    drop... should be like Notion when you click hold the item"). The e2e suite never caught this
    because it simulated an artificial "hold perfectly still, then move" gesture to satisfy the same
    constraint, not how anyone actually drags. Split into two sensors — dnd-kit's standard pattern
    for this exact tension: `MouseSensor` with a small distance-only threshold (drag starts the
    instant the pointer moves a few px, matching Notion-style responsiveness) and `TouchSensor`
    keeping the original delay (still needed there). Re-verified the full drag-and-drop e2e suite
    across chromium/webkit/mobile-safari.

54. **Drag-to-reorder siblings: pages, credential folders, credentials, canvases.** ✅ *done*. Step
    52 covered reparenting only — no way to drop an item at a specific position among its siblings,
    reported directly against a screenshot of three sibling root pages ("one thing I can't do is
    drag and drop it for them to re-order there positions"). Added a `position` (`double precision`)
    column to all four tables (`supabase/migrations/20260818150000_position_ordering.sql`),
    backfilled to preserve each table's current visible order exactly, reordered via a
    client-computed midpoint between two neighbors (`packages/shared/src/lib/positionUtils.ts`'s
    `computeReorderPosition`/`computeAppendPosition`) rather than an integer-with-gaps or
    fractional-indexing scheme — the simplest option that still supports O(1) reorders, accepted
    given this app's realistic (not high-volume) write pattern; see the Data model section above for
    the float-precision tradeoff this implies. New `ReorderStrip.tsx` — a thin, always-mounted,
    zero-height drop target rendered between every pair of siblings (and before/after the group) —
    gives a "drop a line between two rows" interaction distinct from dropping *onto* a row (still
    reparents, appended at the end). Extended to credentials and canvases, which had no drag support
    at all before this (the user explicitly asked for full symmetry, not just pages/folders).
    Two real bugs found and fixed during testing, not just test artifacts: (1) reading the DOM
    immediately after a drop raced this app's deliberate no-optimistic-update convention — every
    reorder e2e assertion needed a settle wait after the drag, same latency real users see; (2) at
    the boundary between the credential tree's folder-group and credential-group, two adjacent
    zero-height strips physically overlapped at the same point, so `pointerWithin` sometimes picked
    the wrong one — fixed by removing the redundant strip and having the survivor serve both
    purposes (see `CredentialList.tsx`'s `handleFolderDragEnd`). Also added `dragOverlayOffset.ts`,
    a dnd-kit `Modifier` shifting the drag ghost away from the cursor so it stops covering the drop
    indicator it exists to help aim at — reported directly ("it is blocking the view of where it
    would land"). Verified: `check-types`/`lint`/`build` clean; full e2e suite (60 tests,
    chromium/webkit/mobile-safari) passing, including new reorder tests for all four surfaces
    (root + nested pages, folders + credentials with reparent, canvases with reload-persistence
    check).

55. **Add Vercel Speed Insights.** ✅ *done*. Installed `@vercel/speed-insights` and mounted
    `<SpeedInsights />` in the root layout (`app/layout.tsx`) to collect real-user Core Web Vitals
    for the production deploy. Free on the Hobby plan for one project up to 10,000 events/month —
    past that Vercel just pauses recording until the next day rather than billing, so this stays
    within the zero-cost constraint. Verified: `check-types`/`lint`/`build` clean.
