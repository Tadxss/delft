// Same rationale as p/[pageId]/_components/PageShell.tsx — rendered while useCanvas() is still
// resolving but the sidebar's useCanvases() cache already knows this canvas's title. Matches
// CanvasEditor's real header layout exactly so there's no layout shift once the full editor
// (Excalidraw, itself already dynamically imported inside CanvasEditor.tsx) replaces this.
export function CanvasShell({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 pb-2 pt-16 sm:px-6 sm:pt-6">
        <p className="w-full flex-1 truncate text-2xl font-bold leading-snug text-ink-800">
          {title || "Untitled"}
        </p>
      </div>
      <div className="flex-1 animate-pulse bg-paper-100" />
    </div>
  );
}
