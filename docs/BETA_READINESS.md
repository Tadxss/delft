# BETA readiness audit

Snapshot from a full audit pass (two research passes: security/data-integrity/RLS, and
accessibility/mobile/error-state coverage) after Build Order step 20 in
[docs/ARCHITECTURE.md](ARCHITECTURE.md). Written so a session with zero conversation context can
pick any item below and start fixing it directly — nothing here has been fixed yet, this is
findings only.

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

### 1. Silent autosave failures (Pages + Canvas)
`PageEditor.tsx`'s and `CanvasEditor.tsx`'s `scheduleSave` call `updatePage.mutate(...)` /
`updateCanvas.mutate(...)` with no `onError` callback, and neither component ever reads
`.isError`/`.error` off the mutation object. If a session expires mid-edit, or any request fails
(network drop, RLS rejection), the user keeps typing believing it's autosaving — there is no
toast, no inline message, no retry affordance. Edits past the last successful save are silently
lost. This is the single most user-impacting gap found, since autosave is the core interaction
model for both editors.

`CredentialDetail.tsx` already does this correctly (`saveError` is read and rendered) — but
credentials use an explicit Save button, not background autosave, so mirror that pattern's
*display* approach (inline error text near the save-affected UI) while keeping autosave's
debounced-mutation structure intact.

**Files**: `apps/web/app/workspace/[workspaceSlug]/p/[pageId]/_components/PageEditor.tsx`,
`apps/web/app/workspace/[workspaceSlug]/canvas/[canvasId]/_components/CanvasEditor.tsx`,
`packages/shared/src/hooks/useUpdatePage.ts`, `packages/shared/src/hooks/useUpdateCanvas.ts`.

**Suggested next step**: surface `updatePage.isError`/`updateCanvas.isError` in each editor (a
small persistent "Couldn't save — retrying" or "Couldn't save your last change" indicator near the
title, not just console-invisible internal query state). Consider whether TanStack Query's retry
behavior is already enabled by default for these mutations before adding manual retry UI.

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

### 3. Zero responsive/mobile layout
Confirmed via grep: 0 uses of `sm:`/`md:`/`lg:`/`xl:`/`2xl:` anywhere in `apps/web/app`, no
`@media` queries in `globals.css`. Concrete breakage:
- `Sidebar.tsx` has a hardcoded `w-64` (256px) with no viewport-based collapse — only a manual
  desktop toggle persisted via `localStorage` (`SidebarShell.tsx`), not a breakpoint-driven
  drawer/overlay pattern.
- `PageEditor.tsx` has fixed `px-8`/`pt-28` regardless of viewport.
- `CredentialsModal.tsx`'s list+detail two-pane layout (`flex min-h-0 flex-1` with `CredentialList`
  + a detail pane side by side) has no stacking fallback for narrow widths.

On a ~375px phone viewport the app is effectively unusable (sidebar alone consumes ~68% of the
screen), not just visually cramped.

**Files**: `apps/web/app/workspace/[workspaceSlug]/_components/{Sidebar,SidebarShell}.tsx`,
`.../p/[pageId]/_components/PageEditor.tsx`, `.../_components/credentials/CredentialsModal.tsx`,
`apps/web/app/globals.css`.

**Suggested next step**: decide the actual target (is mobile support in scope for this BETA, or is
"desktop-only for now" an acceptable documented constraint like the zero-cost one in
`CLAUDE.md`?). If in scope: sidebar becomes an off-canvas drawer below a breakpoint, editors drop
fixed horizontal padding in favor of viewport-relative spacing, `CredentialsModal`'s two-pane
layout stacks vertically below a breakpoint. Playwright already supports device-emulation projects
(`devices["iPhone 13"]`) — see item 5 below — so a mobile viewport check could be added to the e2e
suite once this is fixed, not before.

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

### 5. No Safari/WebKit/mobile test coverage at all
`playwright.config.ts` only configures `{ name: "chromium", use: devices["Desktop Chrome"] }` —
confirmed, not speculative. No Firefox, no WebKit, no mobile emulation profile. Combined with known
iOS Safari quirks in three dependencies actually in use:
- `browser-image-compression` (`PageEditor.tsx`) — WebP encode support only reliable from iOS 14+,
  canvas memory limits on older iOS.
- `@excalidraw/excalidraw` (`CanvasEditor.tsx`) — historical touch/pointer-event conflicts
  (pinch-zoom vs. page scroll) on iOS Safari.
- `@blocknote/mantine` (`PageEditor.tsx`) — contentEditable/ProseMirror editors have a history of
  iOS-specific virtual-keyboard and cursor-placement bugs.

None of this is verified either automatically or (as far as this audit could determine) manually.

**Files**: `apps/web/playwright.config.ts`.

**Suggested next step**: at minimum, manually test the Pages editor, Canvas, and the Credentials
modal on a real iOS Safari device/simulator before calling this BETA. Longer-term, add a WebKit
Playwright project (`devices["Desktop Safari"]` and/or `devices["iPhone 13"]`) — note this is
naturally blocked on item 3 (no responsive layout) for the mobile-viewport variant specifically.

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
  `docs/ARCHITECTURE.md`'s Data model section) — not a gap unless multi-user sharing ships.
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
