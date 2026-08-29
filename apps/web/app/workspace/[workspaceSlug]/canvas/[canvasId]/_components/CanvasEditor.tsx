"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import type { Canvas } from "@crowscribe/types";
import {
  usePublishCanvas,
  useUnpublishCanvas,
  useUpdateCanvas,
} from "@crowscribe/shared";
import { EditedIndicator } from "../../../../../_components/EditedIndicator";
import { HEADING_CLASSES } from "../../../../../_components/Heading";
import "@excalidraw/excalidraw/index.css";

const AUTOSAVE_DEBOUNCE_MS = 800;
const AUTOSAVE_RETRY_MS = 2000;

// Excalidraw touches `window`/`document` at module load and cannot be server-rendered — the first
// component in this codebase needing that treatment (BlockNote, the Pages editor, tolerates SSR
// fine). Since ssr:false means the server renders nothing for it at all, there's no server/client
// HTML to diverge — no hydration-mismatch risk the way the Google-button theme prop had.
const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
  {
    ssr: false,
    loading: () => <div className="h-full w-full" />,
  },
);

type ExcalidrawOnChange = NonNullable<
  React.ComponentProps<typeof Excalidraw>["onChange"]
>;
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
  const { resolvedTheme } = useTheme();
  const updateCanvas = useUpdateCanvas();
  const publishCanvas = usePublishCanvas();
  const unpublishCanvas = useUnpublishCanvas();

  const [title, setTitle] = useState(canvas.title);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Same accumulate-don't-replace pattern as PageEditor's scheduleSave — title and scene changes
  // can both land within the debounce window and must not clobber each other.
  const pendingPatch = useRef<{ title?: string; scene?: unknown }>({});
  // Same in-flight guard as PageEditor's flush() — see its comment for why: without this, two
  // overlapping PATCH requests have no server-side ordering guarantee, so an older save could
  // finish last and clobber a newer edit.
  const saving = useRef(false);

  useEffect(() => {
    setTitle(canvas.title);
  }, [canvas.id, canvas.title]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      pendingPatch.current = {};
    };
  }, [canvas.id]);

  function flush() {
    if (saving.current) return;
    const toSave = pendingPatch.current;
    if (Object.keys(toSave).length === 0) return;
    pendingPatch.current = {};
    saving.current = true;
    let hadError = false;
    updateCanvas.mutate(
      { id: canvas.id, ...toSave },
      {
        onError: () => {
          hadError = true;
          pendingPatch.current = { ...toSave, ...pendingPatch.current };
          retryTimer.current = setTimeout(flush, AUTOSAVE_RETRY_MS);
        },
        onSettled: () => {
          saving.current = false;
          if (!hadError) flush();
        },
      },
    );
  }

  function scheduleSave(patch: { title?: string; scene?: unknown }) {
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    scheduleSave({ title: value });
  }

  function handleCanvasChange(
    elements: ExcalidrawElements,
    appState: ExcalidrawAppState,
  ) {
    // Never persist `files` (the third onChange argument) — no rendered image/binary is stored
    // server-side, matching the image tool being hidden below. `collaborators` is a live Map (not
    // meaningful to persist, and irrelevant in this non-collaborative app) — drop it explicitly.
    const appStateToSave: Partial<ExcalidrawAppState> = { ...appState };
    delete appStateToSave.collaborators;
    scheduleSave({ scene: { elements, appState: appStateToSave } });
  }

  const shareUrl = useMemo(() => {
    if (!canvas.isPublished || !canvas.publishedSlug) return null;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}/share/canvas/${canvas.publishedSlug}`;
  }, [canvas.isPublished, canvas.publishedSlug]);

  function handlePublishToggle() {
    if (canvas.isPublished) {
      unpublishCanvas.mutate({ id: canvas.id });
    } else {
      publishCanvas.mutate({
        id: canvas.id,
        existingSlug: canvas.publishedSlug,
      });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 bg-paper-50 px-4 pb-6 pt-14 sm:px-8 sm:pt-6">
        <label htmlFor="canvas-title" className="sr-only">
          Title
        </label>
        <input
          id="canvas-title"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Untitled"
          maxLength={200}
          className={`min-w-0 flex-1 border-none bg-transparent outline-none placeholder:text-ink-400 ${HEADING_CLASSES["content-compact"]}`}
        />
        <div className="flex shrink-0 items-center gap-3">
          <EditedIndicator timestamp={canvas.updatedAt} />
          <button
            type="button"
            onClick={handlePublishToggle}
            disabled={publishCanvas.isPending || unpublishCanvas.isPending}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              canvas.isPublished
                ? "bg-accent-500 text-white hover:bg-accent-600"
                : "border border-paper-300 text-ink-600 hover:bg-paper-100"
            }`}
          >
            {canvas.isPublished ? "Published" : "Publish"}
          </button>
        </div>
      </div>

      {updateCanvas.isError && (
        <p className="shrink-0 px-4 text-xs text-red-700 sm:px-8">
          Couldn&apos;t save your last change
          {updateCanvas.error?.message ? `: ${updateCanvas.error.message}` : ""}
        </p>
      )}

      {shareUrl && (
        <div className="shrink-0 px-4 pb-2 sm:px-8">
          <div className="flex items-center gap-2 rounded-md bg-paper-100 px-3 py-2 text-xs text-ink-600">
            <span>Live at</span>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate underline"
            >
              {shareUrl}
            </a>
          </div>
        </div>
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
