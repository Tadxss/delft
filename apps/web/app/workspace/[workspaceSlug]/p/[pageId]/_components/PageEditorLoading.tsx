// Shared between page.tsx's dynamic() loading fallback (while the BlockNote chunk itself is still
// downloading) and loading.tsx (Next's route-level Suspense fallback, shown before any client code
// has run at all) — kept as one component so the two moments can't visually drift apart. No title
// is known yet at this point (unlike PageShell, which renders once the sidebar's cached title is
// available), so this is a generic skeleton rather than the real heading. Layout mirrors
// PageEditor's full-width top bar + body so nothing jumps on swap.
export function PageEditorLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-end gap-3 bg-paper-50 px-4 py-1.5 sm:px-8">
        <div className="h-[30px] w-[70px] animate-pulse rounded-md bg-paper-200" />
      </div>
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 pb-10 pt-8 sm:px-8">
        <div className="h-9 w-2/3 animate-pulse rounded bg-paper-200" />
        <div className="flex flex-col gap-3 opacity-40">
          <div className="h-4 w-5/6 animate-pulse rounded bg-paper-200" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-paper-200" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-paper-200" />
        </div>
      </div>
    </div>
  );
}
