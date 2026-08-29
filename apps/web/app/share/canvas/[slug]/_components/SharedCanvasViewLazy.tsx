"use client";

import dynamic from "next/dynamic";

// Excalidraw touches `window`/`document` at module load and cannot be server-rendered — same
// treatment as CanvasEditor.tsx's own Excalidraw import and share/[slug]'s SharedPageViewLazy.
// A share link is cold-loaded by a visitor who never hydrated the app, so ssr:false is required
// here (not just nice-to-have): no server HTML for this component means no hydration mismatch.
export const SharedCanvasView = dynamic(
  () => import("./SharedCanvasView").then((mod) => mod.SharedCanvasView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center text-sm text-ink-400">
        Loading…
      </div>
    ),
  },
);
