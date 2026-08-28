import { HEADING_CLASSES } from "../../../../../_components/Heading";

// Rendered while usePage() is still resolving but the sidebar's usePages() cache already knows
// this page's title (everything short of its jsonb `content`) — shows the title immediately,
// matching PageEditor's real layout (full-width top bar + body) exactly so there's no layout shift
// once the full editor replaces this. Deliberately not an <input> (not editable here) and
// deliberately doesn't touch `content` — PageEditor's useCreateBlockNote(..., [page.id]) reads
// initialContent once at creation time only, so mounting the real editor against placeholder
// content before the real content arrives would risk losing it, not just flicker; this shell only
// ever renders chrome, never the editor itself.
export function PageShell({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-end gap-3 bg-paper-50 px-4 pb-1.5 pt-5 sm:px-8">
        <div className="h-[30px] w-[70px] animate-pulse rounded-md bg-paper-200" />
      </div>
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 pb-10 pt-8 sm:px-8">
        <p
          className={`w-full truncate ${HEADING_CLASSES["content-large"]}`}
        >
          {title || "Untitled"}
        </p>
        <div className="flex flex-col gap-3 opacity-40">
          <div className="h-4 w-5/6 animate-pulse rounded bg-paper-200" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-paper-200" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-paper-200" />
        </div>
      </div>
    </div>
  );
}
