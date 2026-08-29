# BETA readiness audit

Snapshot from a full audit pass (two research passes: security/data-integrity/RLS, and
accessibility/mobile/error-state coverage) after Build Order step 20 in
[docs/ARCHITECTURE.md](ARCHITECTURE.md). Written so a session with zero conversation context can
pick any item below and start fixing it directly — nothing here has been fixed yet, this is
findings only. Reverified against current code as of Build Order step 29: steps 21–29 (Shiki code
blocks, vault verifier, nested credential folders, sidebar/header redesign, page-tree menu, editor
Undo/Redo, profile/avatar upload, username login) shipped in the meantime but none overlap with the
areas below — every finding still holds as originally written.

**Status as of Build Order step 37: every finding below is either fixed or explicitly accepted as
non-blocking risk** — see "Fixed" and "Accepted risk" below. Kept as a historical record (not
deleted) per this doc's own "accumulate, don't delete" convention.

**The original audit was single-user. Build Order steps 79–80 (multi-user workspaces + the first
Edge Function) added surface it never covered — re-audited in a follow-up pass; see
"[Post-step-37: multi-user surface](#post-step-37-multi-user-surface)" at the bottom.**

Live app: `https://crowscribe.space` (the `*.vercel.app` URLs are retired — see ARCHITECTURE.md
Build Order step 82). Read [docs/ARCHITECTURE.md](ARCHITECTURE.md) and
[docs/TESTING.md](TESTING.md) first for the existing architecture/test conventions — every fix
below should follow those same patterns (RLS policy naming, `useX`/`useUpdateX` hook shape,
`window.confirm` for destructive actions, e2e specs per feature, etc.), not introduce new ones.

## How to use this doc

Work top to bottom by severity. When an item is fixed: verify it (tests/manual, matching this
repo's existing verification bar — see recent Build Order entries for the standard), then move its
entry to a new "Fixed" section at the bottom with a one-line pointer to the Build Order step that
covers it, rather than deleting it — same "accumulate, don't delete" convention as
`ARCHITECTURE.md`.

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
  `<label htmlFor>` pairs. The one exception at the time of the original audit — page/canvas
  title — is fixed too now, see "Fixed" below.

## Accepted risk — not a BETA blocker

- **No application-level mutation rate limiting.** Nothing throttles how fast an authenticated
  session can create/update/delete rows against `pages`/`credentials`/`canvases`. Acceptable for a
  single trusted user (the only attacker with valid credentials is you); Supabase's own unmodified
  auth-endpoint rate limits (`[auth.rate_limit]` in `supabase/config.toml`) still apply to
  sign-in/token-refresh regardless. Revisit if the user base ever grows beyond one trusted person,
  or if Google OAuth is ever opened up more broadly.
- **No real iOS Safari device/simulator testing** (item 5's one remaining piece). `webkit`/
  `mobile-safari` Playwright projects (Build Order steps 32-33) cover the WebKit _engine_, but not
  real Safari on real hardware/touch input — no such device was available to set that up.
  Deliberately left open rather than adding a paid device-lab service (BrowserStack etc., which
  would also mean routing a credentials app's traffic through a third party) or a real-Safari CI
  toolchain (macOS runner + `safaridriver`/Appium — a genuinely separate setup from the rest of the
  e2e suite). The cheapest real coverage here is manual: open `https://crowscribe.space` on an
  iPhone/iPad you own and walk through Pages/Canvas/Credentials once in a while.

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
simulator" ask — moved to "Accepted risk" below rather than left as open work, since no real device
was available here and the alternatives (a paid device lab, or a separate real-Safari CI toolchain)
were deliberately declined for now.

### 2. Every read-hook consumer swallows errors — fixed, see [docs/ARCHITECTURE.md](ARCHITECTURE.md) Build Order step 34

`useWorkspaces`, `usePages`, `useCredentials`, `useCanvases`, `usePage`, `useCanvas` were
destructured as `{ data, isLoading }` only, everywhere they were consumed — `.isError`/`.error` was
never read anywhere in `apps/web`. A failed fetch (RLS error, network drop) was indistinguishable in
the UI from "genuinely empty" (e.g. "No pages yet.") or "not found." Mutations (writes) already
surfaced errors correctly elsewhere (`useCreateWorkspace`, `useCreateCredential`, the auth hooks) —
this gap was specifically on the read side.

Fixed by adding `isError`/`error` to all six call sites and an inline `text-red-700` branch
alongside the existing loading/empty-state logic, matching the mutation-error styling already used
elsewhere (`CredentialDetail.tsx`'s `saveError`, and this session's own item-1 fix): `workspace/
page.tsx` (`useWorkspaces`), `Sidebar.tsx` (`usePages` + `useCanvases`, once per section),
`CredentialsModal.tsx` (`useCredentials`, a standalone banner that doesn't gate the rest of the
modal), and the page/canvas route files (`usePage`/`useCanvas`, an `isError` early-return alongside
the existing loading/not-found ones).

Verified against a real local Supabase session by forcing each of the six underlying `GET` requests
to fail (`page.route(...).abort("failed")`) and confirming every message actually rendered — not
just written and assumed correct. Take-away worth recording: in local `next dev`, a forced query
failure can take **15-20 seconds** to settle into `isError` (well past `providers.tsx`'s nominal
`retry: 1`), likely React StrictMode's dev-only double-invoke compounding retry attempts — a
verification script using a short wait (1-4s, matching item 1's mutation-error timing) will falsely
read as broken. Plus `pnpm check-types`/`lint` (repo-wide).

### 4. `Modal.tsx` has no dialog semantics — fixed, see [docs/ARCHITECTURE.md](ARCHITECTURE.md) Build Order step 35

No `role="dialog"`/`aria-modal`, no focus trap, no focus-in-on-open or focus-return-on-close — both
the backdrop and panel used `role="presentation"` (the panel's was semantically wrong: it strips
dialog semantics rather than adding them). Tab could move focus out of the modal into the page
behind it. Affected `CredentialsModal` specifically, which holds sensitive data.

Fixed, confined entirely to `Modal.tsx` (no consumer changed): the panel now gets `role="dialog"` +
`aria-modal="true"`; a manual Tab/Shift+Tab handler traps focus within the panel's own focusable
elements (`inert`-ing siblings was considered and rejected — it gets genuinely awkward for the
nested-modal case, since `MoveCredentialFolderModal` opens from inside `CredentialsModal` and both
portal to `document.body`); and a `useEffect` moves focus into the panel on open (first focusable
element, falling back to the panel itself) and back to whatever triggered it on close.

**Real bug found and fixed during verification**: the first implementation guarded the Tab-wrap
logic against the nested-modal case (only act if `document.activeElement` is inside _this_
instance's own panel) but left the Escape branch unguarded — every open `Modal` instance adds its
own `window`-level `keydown` listener, so pressing Escape once fired _both_ the inner and outer
modal's `onClose` simultaneously, closing both instead of just the topmost one. Caught by an actual
nested-modal test (open Credentials → open the Move-folder dialog → Escape → assert exactly one
`[role="dialog"]` remains), not just eyeballing the diff. Fixed by moving the same
panel-contains-focus guard above the Escape/Tab branch instead of only the Tab one.

Verified against a real local Supabase session: dialog role/`aria-modal` present on open; focus
lands inside the panel immediately (on the Close button, the first focusable element) without an
explicit call, confirmed via `document.activeElement`; 15 forward Tabs and 5 Shift+Tabs never
escape the panel; Escape closes and returns focus to the original trigger button. Nested case
(Credentials → Move-folder) confirmed separately: Tab stays within the innermost dialog, and Escape
closes only that one, leaving the outer modal open. Plus the full 48-test suite
(`chromium`/`webkit`/`mobile-safari`) green with no regressions, and `pnpm check-types`/`lint`.

### Low severity batch (label, favicon, error.tsx, metadata) — fixed, see [docs/ARCHITECTURE.md](ARCHITECTURE.md) Build Order step 36

Four small independent gaps, closed together: no `<label>` on the page/canvas title input
(`PageEditor.tsx`/`CanvasEditor.tsx`, relied solely on `placeholder="Untitled"`); no favicon at all
(`apps/web` had no `public/` directory or `app/favicon.ico`/`icon.*`); no `app/error.tsx` anywhere
(an unexpected render-time throw showed Next's bare default error screen); no `openGraph`/`twitter`/
explicit `viewport` metadata, `/share/[slug]` pages had no per-page metadata despite being the one
route meant for external sharing (link previews).

Fixed: `PageEditor.tsx`/`CanvasEditor.tsx` each got an `sr-only` `<label htmlFor>` paired with the
title input's new `id`; `apps/web/app/icon.tsx` generates a favicon at request time via Next's
built-in `next/og` `ImageResponse` (a plain "D" monogram in the app's ink-800/paper-50 palette —
zero-cost, no external asset or service, matching the file-based icon convention Next.js already
supports); `app/error.tsx` (root) and `app/workspace/error.tsx` (scoped, so the TopBar stays mounted
around it, per the doc's own suggestion — that's where the state-heavy editors live) both render a
"Something went wrong."/message/"Try again" fallback; root `layout.tsx` gained `openGraph`/`twitter`
fields and an explicit `viewport` export, and `share/[slug]/page.tsx` gained a `generateMetadata`
using the shared page's own title (a second, smaller query beyond the page component's own fetch,
since the different `.select()` columns mean Next's request memoization won't dedupe them — accepted
as a minor cost for correctness over rigging up a shared cached fetch for one route).

Verified against a real local Supabase session, not just written and assumed correct: both title
labels confirmed via `page.getByLabel("Title")` resolving to the actual input in both editors; the
favicon confirmed by fetching `/icon` directly (200, `image/png`, visually a "D" monogram); both
error boundaries confirmed by _forcing a real render-time throw_ (a temporary always-throwing route
for the root one; a temporary click-triggered `throw` in an already-authenticated page for the
workspace-scoped one, since navigating directly to a fresh throwing route raced `AuthGate`'s
session-reestablishment on full reload and isn't representative of how a real user would ever hit
this — the failure is mid-session, not on a cold load) — both showed the fallback UI, and "Try
again" successfully reset the workspace-scoped one back to real content. All temporary test
files/routes removed afterward, confirmed via a clean `git diff`. Plus `pnpm build` (confirms the
`/icon` route and both metadata exports compile), `pnpm check-types`/`lint`, and the full 48-test
e2e suite (`chromium`/`webkit`/`mobile-safari`) green with no regressions.

### Storage orphaning on page/workspace delete — fixed, see [docs/ARCHITECTURE.md](ARCHITECTURE.md) Build Order step 37

Deleting a page or workspace only cascaded **Postgres rows** (`on delete cascade` on the FK) —
`useDeletePage`/`useDeleteWorkspace` never called `supabase.storage.from("page-images")
.remove(...)`. Any image uploaded via the BlockNote editor became permanently orphaned in Storage
once its page or workspace was deleted — a slow, one-way leak against the 1GB free tier.

Fixed via a new shared helper, `packages/shared/src/lib/removePageImages.ts` (mirroring the
existing `lib/workspaceUrl.ts` precedent for a plain non-hook utility): `list()`s each given page
ID's `{workspaceId}/{pageId}` Storage prefix and batches everything found into one `remove()` call.
Best-effort by design — caught and logged via `console.error` rather than rethrown, since this is a
slow-leak concern, not a correctness requirement, and blocking a user from deleting a page/workspace
they want gone over a transient Storage hiccup would be a worse tradeoff. Both hooks now call it
_before_ their row delete, not after — `page_images_delete_member`'s RLS scopes on the caller still
being a member of the workspace named by the object path's first segment, which a completed row
delete would already have cascaded away (workspace delete cascades `workspace_members` too).
`useDeletePage` specifically needed to resolve its _whole descendant subtree_ first (deleting a page
cascades every sub-page under it, per its own existing doc comment, not just the one ID passed in)
— reused `Sidebar.tsx`'s own established pattern (fetch all of a workspace's `{id, parent_id}` pairs
in one query, build the tree client-side) rather than adding a new recursive-descendant RPC, since
that's unwarranted extra migration surface at this app's personal scale.

Verified against a real local Supabase session, not just written and assumed correct: uploaded fake
images directly via the Storage REST API to a parent page and a child sub-page's exact path
convention, confirmed both existed via a direct `list()` call, deleted the _parent_ page through the
UI (page-tree "⋯" menu), and confirmed _both_ objects were gone — proving the subtree-cascade case,
not just the single-page case. Repeated the same shape for a whole-workspace delete (image in a
page, delete the workspace from the switcher) and confirmed the object was gone there too. Plus
`pnpm check-types`/`lint` (repo-wide) and the full 48-test e2e suite
(`chromium`/`webkit`/`mobile-safari`) green with no regressions (neither `workspace-delete.spec.ts`
nor `canvas.spec.ts`'s existing delete flows assert on Storage state, so this also confirmed the
added Storage calls introduced no new failure mode in the delete mutations themselves).

This closes every finding from the original (single-user) audit — everything above is now either
fixed or explicitly accepted as non-blocking risk.

## Post-step-37: multi-user surface

Build Order steps 78–80 added a mandatory onboarding flow, `profiles.company/usage_intent/
onboarded_at`, **workspace invitations + `owner/editor/viewer` roles**, and the repo's first
Edge Function (`send-invitation-email`) with the first `SUPABASE_SERVICE_ROLE_KEY` use. A
follow-up re-audit (`rls-reviewer` on `20260830000000` + `20260831000000`; `code-reviewer` on
the Edge Function; a manual pass on the new RPC write paths) found the migrations structurally
clean on every load-bearing invariant. Findings and their disposition:

### Fixed (migration `20260901000000_invitation_hardening.sql` + the Edge Function)
- **HTML injection in the invite email** — `renderHtml` interpolated the workspace name and
  inviter display name (both free text, unsanitized) straight into the HTML body. A workspace
  named `<a href="phish">…</a>` would ride our SPF/DKIM-aligned sending domain as a phishing
  payload. Fixed: an `esc()` helper HTML-escapes every interpolation in `renderHtml` (and the
  href-context URLs); `renderText` and the plaintext subject are unaffected.
- **Unbounded invite creation → Resend-quota exhaustion + `auth.users` pollution.** Any signed-in
  user could create a workspace and call `invite_to_workspace` with arbitrary emails without
  limit; each email invite fires the Edge Function, whose `type: "invite"` fallback provisions an
  `auth.users` row and sends a mail. Fixed: `invite_to_workspace` now enforces a per-workspace
  pending-invite ceiling (100) and a global `rpc_rate_limits` bucket (30 / 60s, same crude
  single-bucket shape as `get_email_for_username`).
- **Owner could replay `send-invitation-email` to spam an invitee.** No standalone "resend"
  button, but the owner could re-invoke the function from devtools against a still-pending token.
  Fixed: `workspace_invitations.last_emailed_at` + `mark_invitation_emailed()` (service_role
  only); the function skips (`{skipped:"throttled"}`) within 60s of the last send.
- **Token-status probing.** The `{skipped:"not-found"|"not-pending"|"no-email"}` responses were
  returned before the caller-authorization check, letting anyone with the public anon key
  distinguish token states. Fixed: the inviter/owner check now runs first; an unauthorized caller
  gets one undifferentiated `{skipped:"not-authorized"}`.
- **Recipient email in Edge Function logs** — the Resend error body (which echoes `to`) was
  `console.error`'d. Fixed: log the status code only.
- **`get_invitation_for_email` → `SECURITY INVOKER`** (was `DEFINER`) — only `service_role` can
  call it and `service_role` already bypasses RLS; elevated mode wasn't needed.
- Added a `signal: AbortSignal.timeout(10_000)` to the Resend `fetch`.

### Confirmed clean
- **`has_workspace_access` recursion** — `SECURITY INVOKER`, only ever called from policies on
  tables *other* than `workspace_members`; its inner read resolves through the non-self-subquering
  `workspace_members_select_self`. No recursion. (Now a documented load-bearing detail — see
  `docs/ARCHITECTURE.md` Build Order step 2 and `CLAUDE.md`.)
- **Every new RPC's authorization** — owner-only ones (`invite_to_workspace`,
  `revoke_workspace_invitation`, `get_workspace_invitations`, `set_workspace_member_role`,
  `remove_workspace_member`) all gate on `workspaces.owner_id = auth.uid()` as the first check;
  `accept_workspace_invitation` requires a valid token **and** an identity match, so you can't
  join a workspace you weren't invited to; `set_workspace_member_role`/`remove_workspace_member`
  can't target the owner row or escalate anyone to `owner`; `leave_workspace` is self-only and
  the owner can't leave. `accept_workspace_invitation` is the only new `workspace_members` writer,
  race-safe via `SELECT … FOR UPDATE` + `ON CONFLICT DO NOTHING`.
- **`email_confirmed_at` trust** — no code path (RLS policy or RPC) trusts the raw
  `auth.jwt() ->> 'email'` claim, which can be unconfirmed under `enable_confirmations = false`.
  Invitee matching is against `invited_user_id` (stamped only for confirmed accounts), the
  profile username, or `auth.users.email_confirmed_at`.
- **`get_invitation_preview`** — new `anon`-callable RPC. Token-guarded (256-bit), rate-limited
  under its own `rpc_rate_limits` key, returns only display fields (workspace name/logo, inviter
  display name, role, status, expiry) — no email or other PII. Acceptable, same tradeoff as
  `get_email_for_username`.
- **Edge Function auth** — `verify_jwt = true` is *not* the authz boundary (the public anon key
  satisfies it); the in-function `getUser()` + inviter/owner check is. An anon-key or service-key
  JWT yields no `user` → rejected. `SITE_URL` is a server secret, never caller-supplied.
- **Storage** — `page-images` / `workspace-logos` write policies now correctly require
  `role in ('owner','editor')`; the `(storage.foldername(name))[1]` membership idiom preserved.
- **Service-role key** — still never referenced in browser-shipped code. The Edge Function
  (`supabase/functions/send-invitation-email/`) is the only user; it's fire-and-forget, not a
  data-write path, and no-ops without `RESEND_API_KEY`.

### Accepted risk — not a BETA blocker
- **No application-level mutation rate limiting on `pages`/`canvases`** (the original "Accepted
  risk" item, now with a real "revisit" trigger — editors hold valid credentials inside a
  workspace). Still accepted: the same "needs shared cross-request state, which the Vercel
  runtime doesn't have and an external Redis was declined" reasoning holds; the blast radius is
  one workspace's own content, editors are people the owner deliberately invited, and Supabase's
  auth-endpoint limits still apply. Revisit if a workspace ever has untrusted collaborators.
- **`get_invitation_preview` global rate bucket** — a single shared `rpc_rate_limits` row, so a
  determined anon caller can throttle the `/invite/[token]` *preview* screen for everyone
  (accept/decline still work — they're `authenticated`, unthrottled). Same accepted tradeoff as
  `get_email_for_username`.
- **`profiles` (+ `company`/`usage_intent`/`onboarded_at`) and the `avatars` bucket** — still not
  audited to this doc's bar (flagged since Build Order step 28). RLS is `id = auth.uid()`, no
  membership concept, no anon policy — low risk, but not formally cleared.

### Deploy dependency (not a security finding, but a "won't work in prod without it")
Invite acceptance for a not-yet-registered user needs `SITE_URL` set and
`https://crowscribe.space/**` added to the hosted project's Auth redirect-URL allow-list, or
`generateLink`'s `redirectTo` is rejected. See `docs/ARCHITECTURE.md` "Next Up" for the full
pending-deploy checklist.

The multi-user spec surface is now `workspace-invitations.spec.ts` (2 two-context flows), and the
suite is 17 spec files × 3 projects (the "16 specs" / "48-test suite" figures above are
frozen-in-time snapshots from the step-30–37 fixes).
