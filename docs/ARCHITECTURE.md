# Architecture

Delft is a personal, zero-cost management platform (Pages, Credentials Manager, Excalidraw
Canvas) built on Next.js + Supabase + Vercel free tiers, with every feature scoped per-workspace
and isolated via Postgres Row Level Security. See the root [README.md](../README.md) for the
elevator pitch and local dev setup, and [docs/TESTING.md](TESTING.md) for how the e2e suite maps
to manual test scenarios.

This file's **Build Order** section below is the single source of truth for what has shipped, in
what order, why, and what was deliberately deferred — update *it*, not the README's status line,
when something ships. Entries accumulate; don't edit or delete old ones, append new ones instead.

## Next Up

Read this section first in a new session — it's the answer to "what should I work on."

1. **Excalidraw Canvas** (not started). Standalone workspace items (own table, own sidebar
   presence, not embedded in Pages yet — embedding is explicitly deferred further). Scene data
   (elements + appState) stored as JSON in Postgres, no rendered image/binary. `@excalidraw/
   excalidraw` (MIT, free) for the canvas UI.

2. **Hosted deployment** (not started). Everything so far has only run against the local Supabase
   stack. Needs: create/link a real hosted Supabase project (`supabase link`, `supabase db push`),
   a Vercel project with `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` set for the
   hosted project, and revisiting the image-compression settings in `PageEditor.tsx` against real
   Storage usage once there's real data (flagged in step 3 below as a zero-cost risk to recheck,
   not a one-time check).

**Credentials Manager shipped** — see Build Order step 16 below for the final design (some details
differ from what was originally sketched here, e.g. username/password/notes end up bundled into
one ciphertext per credential rather than separate columns).

## Data model

- `workspaces (id, owner_id, name, vault_salt, created_at)` — `vault_salt` is the Credentials
  Manager's per-workspace PBKDF2 salt (plaintext; salts aren't secret), null until that workspace's
  vault passphrase is first set up.
- `workspace_members (workspace_id, user_id, role)` — every RLS policy keys off membership rather
  than `owner_id` directly, so extending to real multi-user sharing later is a data change, not a
  schema/policy rewrite.
- `pages (id, workspace_id, parent_id, title, content jsonb, is_published, published_slug,
  created_at, updated_at)` — `parent_id` self-references `pages` for the sidebar tree.
- `credentials (id, workspace_id, title, url, secret_ciphertext, secret_iv, created_at,
  updated_at)` — `title`/`url` plaintext (list view + search); `secret_ciphertext`/`secret_iv` are
  one AES-GCM ciphertext+iv pair encrypting a `{username, password, notes}` JSON payload per
  credential. See Build Order step 16.

RLS: every table requires membership (`workspace_members`) except one deliberate hole —
`pages_select_published_anon`, readable by `anon`, scoped strictly to `is_published = true`.
`credentials` has no anon policy or grant at all — unlike `pages`, it has no public share surface.
See `supabase/migrations/*_rls.sql` for the full policy set and its inline reasoning.

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

**Deferred, not started:** Excalidraw Canvas, hosted (non-local) Supabase project + Vercel
deployment — see **Next Up** above for the concrete plan on each.
