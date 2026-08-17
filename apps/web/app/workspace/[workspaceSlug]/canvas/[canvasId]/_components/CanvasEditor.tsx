"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import type { Canvas } from "@delft/types";
import { useDeleteCanvas, useUpdateCanvas } from "@delft/shared";
import "@excalidraw/excalidraw/index.css";

const AUTOSAVE_DEBOUNCE_MS = 800;

// Excalidraw touches `window`/`document` at module load and cannot be server-rendered — the first
// component in this codebase needing that treatment (BlockNote, the Pages editor, tolerates SSR
// fine). Since ssr:false means the server renders nothing for it at all, there's no server/client
// HTML to diverge — no hydration-mismatch risk the way the Google-button theme prop had.
const Excalidraw = dynamic(() => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
});

type ExcalidrawOnChange = NonNullable<React.ComponentProps<typeof Excalidraw>["onChange"]>;
type ExcalidrawElements = Parameters<ExcalidrawOnChange>[0];
type ExcalidrawAppState = Parameters<ExcalidrawOnChange>[1];

interface Scene {
  elements: ExcalidrawElements;
  appState: Partial<ExcalidrawAppState>;
}

function toInitialData(scene: unknown): Scene | undefined {
  if (
    scene &&
    typeof scene === "object" &&
    "elements" in scene &&
    Array.isArray((scene as Scene).elements)
  ) {
    return scene as Scene;
  }
  return undefined;
}

export function CanvasEditor({ canvas }: { canvas: Canvas }) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const updateCanvas = useUpdateCanvas();
  const deleteCanvas = useDeleteCanvas();

  const [title, setTitle] = useState(canvas.title);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Same accumulate-don't-replace pattern as PageEditor's scheduleSave — title and scene changes
  // can both land within the debounce window and must not clobber each other.
  const pendingPatch = useRef<{ title?: string; scene?: unknown }>({});

  useEffect(() => {
    setTitle(canvas.title);
  }, [canvas.id, canvas.title]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      pendingPatch.current = {};
    };
  }, [canvas.id]);

  function scheduleSave(patch: { title?: string; scene?: unknown }) {
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const toSave = pendingPatch.current;
      pendingPatch.current = {};
      updateCanvas.mutate({ id: canvas.id, ...toSave });
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    scheduleSave({ title: value });
  }

  function handleCanvasChange(elements: ExcalidrawElements, appState: ExcalidrawAppState) {
    // Never persist `files` (the third onChange argument) — no rendered image/binary is stored
    // server-side, matching the image tool being hidden below. `collaborators` is a live Map (not
    // meaningful to persist, and irrelevant in this non-collaborative app) — drop it explicitly.
    const appStateToSave: Partial<ExcalidrawAppState> = { ...appState };
    delete appStateToSave.collaborators;
    scheduleSave({ scene: { elements, appState: appStateToSave } });
  }

  function handleDelete() {
    if (!window.confirm("Delete this canvas?")) return;
    deleteCanvas.mutate(
      { id: canvas.id, workspaceId: canvas.workspaceId },
      { onSuccess: () => router.push(`/workspace/${canvas.workspaceId}`) },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 pb-2 pt-16 sm:px-6 sm:pt-6">
        <label htmlFor="canvas-title" className="sr-only">
          Title
        </label>
        <input
          id="canvas-title"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Untitled"
          className="w-full flex-1 border-none bg-transparent text-2xl font-bold leading-snug text-ink-800 outline-none placeholder:text-ink-400"
        />
        <button
          type="button"
          onClick={handleDelete}
          className="shrink-0 rounded-md px-2 py-1.5 text-xs text-ink-400 hover:bg-paper-100 hover:text-red-700"
        >
          Delete
        </button>
      </div>

      {updateCanvas.isError && (
        <p className="shrink-0 px-4 text-xs text-red-700 sm:px-6">
          Couldn&apos;t save your last change
          {updateCanvas.error?.message ? `: ${updateCanvas.error.message}` : ""}
        </p>
      )}

      <div className="min-h-0 flex-1">
        <Excalidraw
          initialData={toInitialData(canvas.scene)}
          onChange={handleCanvasChange}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          UIOptions={{ tools: { image: false } }}
        />
      </div>
    </div>
  );
}
