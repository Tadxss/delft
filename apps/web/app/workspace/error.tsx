"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

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
      <h1 className="text-xl font-semibold text-ink-800">
        Something went wrong.
      </h1>
      <p className="max-w-sm text-sm text-ink-500">
        We hit an unexpected problem. Try again, or come back in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-ink-800 px-4 py-2 text-sm font-medium text-paper-50 hover:bg-ink-700"
      >
        Try again
      </button>
    </div>
  );
}
