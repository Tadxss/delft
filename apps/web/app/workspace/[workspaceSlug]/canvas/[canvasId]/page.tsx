"use client";

import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { CanvasSummary } from "@crowscribe/types";
import { parseWorkspaceSlug, useCanvas } from "@crowscribe/shared";
import { CanvasEditor } from "./_components/CanvasEditor";
import { CanvasShell } from "./_components/CanvasShell";

export default function CanvasRoute() {
  const params = useParams<{ workspaceSlug: string; canvasId: string }>();
  const workspaceId = parseWorkspaceSlug(params.workspaceSlug);
  const queryClient = useQueryClient();
  const {
    data: canvas,
    isLoading,
    isError,
    error,
  } = useCanvas(params.canvasId);

  if (isLoading) {
    // Same rationale as p/[pageId]/page.tsx — show the sidebar's already-cached title instead of a
    // blank "Loading…" flash when navigation came from a sidebar click.
    const cachedCanvases = queryClient.getQueryData<CanvasSummary[]>([
      "canvases",
      workspaceId,
    ]);
    const summary = cachedCanvases?.find((c) => c.id === params.canvasId);
    if (summary) return <CanvasShell title={summary.title} />;

    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-500">
        Loading…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-700">
        Couldn&apos;t load this canvas: {error.message}
      </div>
    );
  }

  if (!canvas) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-500">
        Canvas not found.
      </div>
    );
  }

  return <CanvasEditor canvas={canvas} />;
}
