// Same rationale as p/[pageId]/_components/PageShell.tsx — rendered while useCanvas() is still
// resolving but the sidebar's useCanvases() cache already knows this canvas's title. Matches
// CanvasEditor's real header layout exactly so there's no layout shift once the full editor
// (Excalidraw, itself already dynamically imported inside CanvasEditor.tsx) replaces this.
export function CanvasShell({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 bg-paper-50 px-4 pb-6 pt-14 sm:px-8 sm:pt-6">
        <p className="min-w-0 flex-1 truncate text-2xl font-bold leading-snug text-ink-800">
          {title || "Untitled"}
        </p>
        <div className="h-[30px] w-[76px] shrink-0 animate-pulse rounded-md bg-paper-200" />
      </div>
      <div className="flex-1 animate-pulse bg-paper-100" />
    </div>
  );
}
