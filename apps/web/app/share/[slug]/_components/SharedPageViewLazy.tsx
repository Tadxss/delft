"use client";

import dynamic from "next/dynamic";

// SharedPageView.tsx's useCreateBlockNote() touches `window` during its initial render, not just
// an effect — that's fine for the authenticated page editor (only ever reached via client-side
// navigation after the app's already hydrated), but breaks server rendering here, since a share
// link's whole point is being cold-loaded by a visitor who's never hydrated the app before. Next.js
// silently recovers from the resulting SSR error rather than showing a broken page, but it means
// every fresh visit was throwing a real (if invisible-without-Sentry) server error under the hood.
// ssr:false sidesteps it entirely: no server-rendered HTML for this component to diverge from, so
// no hydration-mismatch risk either — same reasoning as CanvasEditor.tsx's Excalidraw import.
export const SharedPageView = dynamic(
  () => import("./SharedPageView").then((mod) => mod.SharedPageView),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse text-sm text-ink-400">Loading…</div>
    ),
  },
);
