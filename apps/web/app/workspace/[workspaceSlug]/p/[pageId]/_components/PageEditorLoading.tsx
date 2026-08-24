// Shared between page.tsx's dynamic() loading fallback (while the BlockNote chunk itself is still
// downloading) and loading.tsx (Next's route-level Suspense fallback, shown before any client code
// has run at all) — kept as one component so the two moments can't visually drift apart. No title
// is known yet at this point (unlike PageShell, which renders once the sidebar's cached title is
// available), so this is a generic skeleton rather than the real heading.
export function PageEditorLoading() {
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 px-4 pb-10 pt-24 sm:px-8 sm:pt-28">
      <div className="h-9 w-2/3 animate-pulse rounded bg-paper-200" />
      <div className="flex flex-col gap-3 opacity-40">
        <div className="h-4 w-5/6 animate-pulse rounded bg-paper-200" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-paper-200" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-paper-200" />
      </div>
    </div>
  );
}
