"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Next.js's file-based error boundary — catches a render-time throw anywhere under this segment
// and replaces just that segment with this, leaving parent layouts (e.g. the workspace TopBar)
// mounted. `reset()` re-renders the segment rather than a full page reload.
export default function Error({
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
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
