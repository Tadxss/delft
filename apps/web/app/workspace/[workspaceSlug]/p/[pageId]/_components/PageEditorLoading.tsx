// Shared between page.tsx's dynamic() loading fallback (while the BlockNote chunk itself is still
// downloading) and loading.tsx (Next's route-level Suspense fallback, shown before any client code
// has run at all) — kept as one component so the two moments can't visually drift apart.
export function PageEditorLoading() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-ink-500">
      Loading…
    </div>
  );
}
