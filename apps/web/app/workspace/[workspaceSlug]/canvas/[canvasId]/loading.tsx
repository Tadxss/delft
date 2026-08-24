// Route-level Suspense fallback, shown before any client code has run — no title is known yet
// (unlike CanvasShell, which renders once the sidebar's cached title is available), so this is a
// generic skeleton matching CanvasShell's layout rather than the real heading.
export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 pb-2 pt-16 sm:px-6 sm:pt-6">
        <div className="h-8 w-1/3 animate-pulse rounded bg-paper-200" />
      </div>
      <div className="flex-1 animate-pulse bg-paper-100" />
    </div>
  );
}
