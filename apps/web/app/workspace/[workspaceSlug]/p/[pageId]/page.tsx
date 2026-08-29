"use client";

import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import type { PageSummary } from "@crowscribe/types";
import {
  parseWorkspaceSlug,
  useMyWorkspaceRole,
  usePage,
} from "@crowscribe/shared";
import { PageEditorLoading } from "./_components/PageEditorLoading";
import { PageShell } from "./_components/PageShell";

// BlockNote (imported inside PageEditor.tsx) is a large editor library entangled with this
// component's own chrome (undo/redo reads live editor state, autosave reads editor.document), so
// unlike CanvasEditor.tsx — which only dynamic-imports the Excalidraw *library* itself, since it's
// consumed as a plain prop-driven component — the split has to happen at this whole component,
// not just the library import inside it. No ssr:false: unlike Excalidraw (touches window/document
// at load), BlockNote tolerates SSR fine — this only trims the client JS bundle for every route
// that isn't this one, not disable SSR.
const PageEditor = dynamic(
  () => import("./_components/PageEditor").then((mod) => mod.PageEditor),
  { loading: () => <PageEditorLoading /> },
);

export default function PageRoute() {
  const params = useParams<{ workspaceSlug: string; pageId: string }>();
  const workspaceId = parseWorkspaceSlug(params.workspaceSlug);
  const queryClient = useQueryClient();
  const { data: page, isLoading, isError, error } = usePage(params.pageId);
  const canEdit = useMyWorkspaceRole(workspaceId).data !== "viewer";

  if (isLoading) {
    // The sidebar's usePages() already has this page's title cached (everything short of
    // `content`) whenever navigation happened via a sidebar click — show it immediately instead of
    // a blank "Loading…" flash. Falls back to the old behavior when nothing is cached yet (first
    // load of a workspace, or a deep link before the sidebar has ever fetched).
    const cachedPages = queryClient.getQueryData<PageSummary[]>([
      "pages",
      workspaceId,
      undefined,
    ]);
    const summary = cachedPages?.find((p) => p.id === params.pageId);
    if (summary) return <PageShell title={summary.title} />;

    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-500">
        Loading…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-700">
        Couldn&apos;t load this page: {error.message}
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-500">
        Page not found.
      </div>
    );
  }

  return <PageEditor page={page} canEdit={canEdit} />;
}
