// Rendered while usePage() is still resolving but the sidebar's usePages() cache already knows
// this page's title (everything short of its jsonb `content`) — shows the title immediately,
// matching PageEditor's real header layout exactly so there's no layout shift once the full editor
// replaces this. Deliberately not an <input> (not editable here) and deliberately doesn't touch
// `content` — PageEditor's useCreateBlockNote(..., [page.id]) reads initialContent once at creation
// time only, so mounting the real editor against placeholder content before the real content
// arrives would risk losing it, not just flicker; this shell only ever renders chrome, never the
// editor itself.
export function PageShell({ title }: { title: string }) {
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 px-4 pb-10 pt-14 sm:px-8 sm:pt-10">
      <div className="flex items-start justify-between gap-4">
        <p className="w-full flex-1 truncate text-4xl font-bold leading-snug text-ink-800">
          {title || "Untitled"}
        </p>
      </div>
      <div className="flex flex-col gap-3 opacity-40">
        <div className="h-4 w-5/6 animate-pulse rounded bg-paper-200" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-paper-200" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-paper-200" />
      </div>
    </div>
  );
}
