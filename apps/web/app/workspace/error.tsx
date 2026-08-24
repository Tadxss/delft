"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Heading } from "../_components/Heading";

// Scoped to app/workspace/ (rather than relying on the root error.tsx alone) since this is where
// all the state-heavy editors live (BlockNote, Excalidraw) — keeps the TopBar mounted above the
// error instead of losing the whole chrome. Renders inside workspace/layout.tsx's `flex flex-1`
// content area, so this fills that rather than the full viewport (the root one does that).
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <Heading level="page">Something went wrong.</Heading>
      <p className="max-w-sm text-sm text-ink-500">
        We hit an unexpected problem. Try again, or come back in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-paper-50 hover:bg-accent-600"
      >
        Try again
      </button>
    </div>
  );
}
