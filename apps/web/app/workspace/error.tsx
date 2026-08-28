"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "../_components/Button";
import { Heading } from "../_components/Heading";

// Scoped to app/workspace/ (rather than relying on the root error.tsx alone) since this is where
// all the state-heavy editors live (BlockNote, Excalidraw) — a crash in one page/canvas keeps the
// rest of the app shell (and, on the sidebar-less picker route, its header) mounted instead of
// blowing away to the full-page root fallback. Renders inside AppLayout's `flex min-h-0 flex-1`
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
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
