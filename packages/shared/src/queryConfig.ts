// Shared staleTime/gcTime tiers, layered on top of providers.tsx's global 30s staleTime default
// (which stays as the fallback for every hook not listed here — credentials, profile, etc.).
//
// STALE_TIME_ACTIVE_ITEM (usePage/useCanvas): these are kept fresh by their own mutations'
// setQueryData on every save already (see useUpdatePage.ts/useUpdateCanvas.ts), so a modest bump
// over the global default only avoids a redundant refetch-and-flash when re-navigating to the same
// item shortly after leaving it — exactly what the sidebar's hover-prefetch (PageTreeNode.tsx,
// Sidebar.tsx) and the cached-summary route shell (PageShell.tsx/CanvasShell.tsx) are trying to
// make feel instant.
//
// STALE_TIME_SUMMARY_LIST / GC_TIME_SUMMARY_LIST (usePages/useCanvases/useWorkspace/useWorkspaces):
// these only change via explicit mutations that already call invalidateQueries on structural
// change (rename/reparent/reorder/create/delete — see useUpdatePage.ts) — nothing else can make
// this data stale behind the app's back, so a long staleTime costs nothing in correctness. The
// longer gcTime protects against a brief unmount (e.g. the sidebar's mobile drawer closing) forcing
// a full list refetch on next open, since these are read continuously by the always-mounted
// Sidebar.
export const STALE_TIME_ACTIVE_ITEM = 60_000;
export const STALE_TIME_SUMMARY_LIST = 300_000;
export const GC_TIME_SUMMARY_LIST = 600_000;
