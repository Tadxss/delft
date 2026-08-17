"use client";

import { useParams } from "next/navigation";
import { useCanvas } from "@delft/shared";
import { CanvasEditor } from "./_components/CanvasEditor";

export default function CanvasRoute() {
  const params = useParams<{ canvasId: string }>();
  const { data: canvas, isLoading, isError, error } = useCanvas(params.canvasId);

  if (isLoading) {
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
