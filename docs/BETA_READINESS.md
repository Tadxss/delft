# BETA readiness audit

Snapshot from a full audit pass (two research passes: security/data-integrity/RLS, and
accessibility/mobile/error-state coverage) after Build Order step 20 in
[docs/ARCHITECTURE.md](ARCHITECTURE.md). Written so a session with zero conversation context can
pick any item below and start fixing it directly — nothing here has been fixed yet, this is
findings only. Reverified against current code as of Build Order step 29: steps 21–29 (Shiki code
blocks, vault verifier, nested credential folders, sidebar/header redesign, page-tree menu, editor
Undo/Redo, profile/avatar upload, username login) shipped in the meantime but none overlap with the
areas below — every finding still holds as originally written.

Live app: `https://delft.vercel.app`. Read [docs/ARCHITECTURE.md](ARCHITECTURE.md) and
[docs/TESTING.md](TESTING.md) first for the existing architecture/test conventions — every fix
below should follow those same patterns (RLS policy naming, `useX`/`useUpdateX` hook shape,
`window.confirm` for destructive actions, e2e specs per feature, etc.), not introduce new ones.

## How to use this doc

Work top to bottom by severity. When an item is fixed: verify it (tests/manual, matching this
repo's existing verification bar — see recent Build Order entries for the standard), then move its
entry to a new "Fixed" section at the bottom with a one-line pointer to the Build Order step that
covers it, rather than deleting it — same "accumulate, don't delete" convention as
`ARCHITECTURE.md`.

## High severity

### 2. Every read-hook consumer swallows errors
`useWorkspaces`, `usePages`, `useCredentials`, `useCanvases`, `usePage`, `useCanvas` are
destructured as `{ data, isLoading }` only, everywhere they're consumed — `.isError`/`.error` is
never read anywhere in `apps/web`. A failed fetch (RLS error, network drop) is indistinguishable in
the UI from "genuinely empty" (e.g. "No pages yet.") or "not found." Mutations (writes) generally
*do* surface errors correctly already (`useCreateWorkspace`, `useCreateCredential`, the auth hooks,
etc.) — this gap is specifically on the read side.

**Files**: every consumer of the six hooks above — `apps/web/app/workspace/page.tsx`,
`.../_components/Sidebar.tsx`, `.../credentials/CredentialsModal.tsx`, `.../p/[pageId]/page.tsx`,
`.../canvas/[canvasId]/page.tsx`.

**Suggested next step**: a consistent small pattern (e.g. a shared `<QueryError error={...} />`
or just inline `{isError && <p className="text-red-700">...}` matching the mutation-error styling
already used elsewhere) added to each of these six call sites.

## Medium severity

### 4. `Modal.tsx` has no dialog semantics
No `role="dialog"`/`aria-modal`, no focus trap, no focus-in-on-open or focus-return-on-close (the
component's own comment already says "no focus trap"). The only ARIA present is
`role="presentation"` on the backdrop/panel — semantically the *wrong* role for a dialog container
(it strips semantics rather than adding them). Tab can currently move focus out of the modal into
the page behind it. This affects `CredentialsModal` specifically, which holds sensitive data and is
the one place in the app most worth getting right.

**Files**: `apps/web/app/_components/Modal.tsx`.

**Suggested next step**: add `role="dialog"` + `aria-modal="true"` to the panel, a focus trap
(`inert` on siblings, or a small manual trap on Tab/Shift+Tab), move focus into the panel on open
(e.g. to the first focusable element or a close button), and return focus to whatever triggered the
open on close. Keep it minimal/dependency-free per the file's existing "no dialog library" choice —
this doesn't require pulling in Radix or similar, just filling in the specific gaps listed.

## Low severity

- **No `<label>` on the page/canvas title input** — relies solely on `placeholder="Untitled"`.
  Every other form input in the app has a proper `<label htmlFor>` pair; this one doesn't.
  Files: `PageEditor.tsx`, `CanvasEditor.tsx`.
- **No favicon at all** — `apps/web` has no `public/` directory and no `app/favicon.ico`/`icon.*`.
  Browser tab shows a generic/blank icon.
- **No `app/error.tsx` anywhere** — an unexpected render-time throw shows Next's bare default
  error screen instead of a recoverable, branded fallback. A root `app/error.tsx` (and possibly one
  scoped to `app/workspace/`, given that's where all the state-heavy editors live) would cover
  this.
- **No `openGraph`/`twitter`/explicit `viewport` metadata**; `/share/[slug]` pages (the one route
  meant for external sharing) have no per-page metadata (title/description per shared page) despite
  that being exactly where it'd matter most (link previews when a share URL is sent to someone).

## Storage orphaning (real gap, ungraded above — assess severity when picked up)

Deleting a page or workspace only cascades **Postgres rows** (`on delete cascade` on the FK) —
`useDeletePage`/`useDeleteWorkspace` never call `supabase.storage.from("page-images").remove(...)`.
Any image uploaded via the BlockNote editor becomes permanently orphaned in Storage once its page
or workspace is deleted. Not catastrophic short-term, but a slow leak against the 1GB free tier
that never self-heals.

**Files**: `packages/shared/src/hooks/useDeletePage.ts`, `packages/shared/src/hooks/useDeleteWorkspace.ts`.

**Suggested next step**: list objects under the `{workspaceId}/{pageId}/` (or `{workspaceId}/` for
a whole-workspace delete) prefix and `remove()` them as part of the delete mutation, before or
after the row delete. Note a workspace delete needs to enumerate every page under it first (or use
a wildcard-prefix list call) since Storage objects aren't foreign-keyed to Postgres and won't
cascade on their own.

## Confirmed clean — no action needed

- **RLS/grants**: complete on all 5 tables (`workspaces`, `workspace_members`, `pages`,
  `credentials`, `canvases`) for every operation the app's UI actually performs. The previously-
  found `workspaces` DELETE gap (Build Order step 19) is fixed. `workspace_members` having no
  client write path at all is intentional — v1 is single-user-per-workspace by design (see
  `docs/ARCHITECTURE.md`'s Data model section) — not a gap unless multi-user sharing ships. The
  `profiles` table and its `avatars` Storage bucket (added Build Order step 28, after this audit)
  are **not covered by this claim** — their RLS/grants haven't been reviewed against the same bar
  and should be audited before treating them as clean.
- **Service-role key**: never referenced client-side anywhere in `apps/web` or `packages/shared` —
  only the anon key is used, everywhere, exactly as the fully-client-side/RLS-based architecture
  intends.
- **TODO/FIXME/HACK**: zero matches anywhere in the repo.
- **Form labels**: login, account, credential, and workspace-name inputs all have proper
  `<label htmlFor>` pairs (the one exception — page/canvas title — is listed under Low severity).

## Accepted risk — not a BETA blocker

- **No application-level mutation rate limiting.** Nothing throttles how fast an authenticated
  session can create/update/delete rows against `pages`/`credentials`/`canvases`. Acceptable for a
  single trusted user (the only attacker with valid credentials is you); Supabase's own unmodified
  auth-endpoint rate limits (`[auth.rate_limit]` in `supabase/config.toml`) still apply to
  sign-in/token-refresh regardless. Revisit if the user base ever grows beyond one trusted person,
  or if Google OAuth is ever opened up more broadly.

## Fixed

### 1. Silent autosave failures (Pages + Canvas) — fixed, see [docs/ARCHITECTURE.md](ARCHITECTURE.md) Build Order step 30
`PageEditor.tsx`'s and `CanvasEditor.tsx`'s `scheduleSave` called `updatePage.mutate(...)` /
`updateCanvas.mutate(...)` with no `onError` callback, and neither component ever read
`.isError`/`.error` off the mutation object. If a session expired mid-edit, or any request failed
(network drop, RLS rejection), the user kept typing believing it was autosaving — there was no
toast, no inline message, no retry affordance. Edits past the last successful save were silently
lost. This was the single most user-impacting gap found, since autosave is the core interaction
model for both editors.

Fixed by surfacing `updatePage.isError`/`updateCanvas.isError` in each editor as a small
persistent inline message near the title ("Couldn't save your last change: …"), mirroring
`CredentialDetail.tsx`'s existing `saveError` display pattern. Verified against a real local
Supabase session by forcing the underlying `PATCH` requests to fail and confirming the message
rendered in both editors, plus `pnpm check-types`/`lint`.

### 3. Zero responsive/mobile layout — fixed, see [docs/ARCHITECTURE.md](ARCHITECTURE.md) Build Order step 31
Confirmed via grep: 0 uses of `sm:`/`md:`/`lg:`/`xl:`/`2xl:` anywhere in `apps/web/app`, no
`@media` queries in `globals.css`. `Sidebar.tsx` had a hardcoded `w-64` with no viewport-based
collapse, `PageEditor.tsx` had fixed `px-8`/`pt-28` regardless of viewport, and
`CredentialsModal.tsx`'s list+detail two-pane layout had no stacking fallback for narrow widths —
on a ~375px phone viewport the app was effectively unusable.

Fixed: `Sidebar`/`SidebarShell` gained a `md:`-gated off-canvas drawer (fixed toggle button,
backdrop, sliding panel, auto-closes on navigation via `usePathname`) replacing the fixed sidebar
below that breakpoint; `PageEditor`/`CanvasEditor` got viewport-relative padding
(`px-4 sm:px-8`-style); `CredentialsModal`/`CredentialList` switched to a single-pane
master/detail view below `md` (list or detail-with-Back, not both at once) instead of literal
side-by-side stacking, since the modal's fixed height made simultaneous vertical stacking
unworkable. Along the way, found and fixed a related but distinct gap the original audit pass
didn't cover: several row-level actions across the app (Sidebar's collapse button, page-tree
"add sub-page"/"⋯ menu" buttons, credential-folder-tree action icons, the workspace list's Delete
button) were `opacity-0`/`hidden` until `:hover`/`:focus-within`, making them permanently
unreachable on touch with no mouse or keyboard focus to trigger them — now always visible below
`md`, hover-reveal preserved at `md:` and up.

**Known remaining gap, not fully closed by this pass**: no real device/touch-emulation testing was
done (this was verified via Playwright's `devices["iPhone 13"]` viewport emulation over a
mouse-driven Chromium instance, not actual touch input) — see item 5's own real-device gap below.
`CredentialFolderTreeNode`'s rename `<input>` and a few other hover-adjacent affordances weren't
separately re-audited beyond the `group-hover`/`opacity-0` grep sweep above; worth a second pass if
real-device testing (item 5) surfaces anything.

### 5. No Safari/WebKit test coverage — fixed except real-device testing, see [docs/ARCHITECTURE.md](ARCHITECTURE.md) Build Order steps 32-33
`playwright.config.ts` only configured `{ name: "chromium", use: devices["Desktop Chrome"] }` — no
Firefox, no WebKit, no mobile emulation profile. Combined with known iOS Safari quirks in three
dependencies actually in use (`browser-image-compression`'s WebP encode support, Excalidraw's
touch/pointer-event handling, BlockNote/ProseMirror's contentEditable behavior), none of this was
verified automatically or manually.

Fixed: added `webkit` (`devices["Desktop Safari"]`) and `mobile-safari` (`devices["iPhone 13"]`)
projects to `playwright.config.ts`. Running the full suite against them cold surfaced and led to
fixing three real, reproducible bugs — a WebKit-only hydration race in the shared `signIn()` test
helper, a genuine product bug in `AccountModal.tsx`'s `ProfileForm` where the first field a user
typed could get silently dropped, and (mobile-viewport specifically) `canvas.spec.ts`'s
shape-drawing step using desktop-sized pixel offsets that landed off-screen on a narrow viewport —
see Build Order steps 32-33 for the full detail on each. Getting `mobile-safari` green also required
new `e2e/helpers.ts` exports (`openSidebar`, `backToList`, `onlyVisible`) so specs can reach content
that's gated behind the mobile drawer/single-pane credentials view (item 3) rather than always
visible, since the existing suite was written before that UX existed. All 16 specs now pass on all
three projects, repeated twice back-to-back to confirm no flakiness.

**Not closed by this pass**: the doc's original "manually test on a real iOS Safari device/
simulator" ask is still open — no real device was available to do this with, so all of the above is
still emulated/mouse-driven WebKit, not real Safari hardware or real touch input.
