"use client";

import { useTheme } from "next-themes";
import type { ComponentProps } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

type ExcalidrawProps = ComponentProps<typeof Excalidraw>;
type ExcalidrawInitialData = ExcalidrawProps["initialData"];

// Read-only Excalidraw for a published canvas — `viewModeEnabled` disables all editing (no shape
// tools, no selection edits), leaving pan/zoom only. Mirrors CanvasEditor.tsx's own Excalidraw
// mount (image tool hidden, dark/light follows the visitor's theme). Rendered client-only via
// SharedCanvasViewLazy — Excalidraw touches `window` at module load and can't be server-rendered.
function toInitialData(scene: unknown): ExcalidrawInitialData {
  if (
    scene &&
    typeof scene === "object" &&
    "elements" in scene &&
    Array.isArray((scene as { elements: unknown }).elements)
  ) {
    return scene as ExcalidrawInitialData;
  }
  return undefined;
}

export function SharedCanvasView({ scene }: { scene: unknown }) {
  const { resolvedTheme } = useTheme();

  return (
    <div className="h-screen w-screen">
      <Excalidraw
        initialData={toInitialData(scene)}
        viewModeEnabled
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        UIOptions={{ tools: { image: false } }}
      />
    </div>
  );
}
