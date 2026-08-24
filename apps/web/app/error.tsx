"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "./_components/Button";
import { Heading } from "./_components/Heading";

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
      <Heading level="page">Something went wrong.</Heading>
      <p className="max-w-sm text-sm text-ink-500">
        We hit an unexpected problem. Try again, or come back in a moment.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
