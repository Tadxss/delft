"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { Heading } from "../_components/Heading";

// Error boundary for the public /share/[slug] and /share/canvas/[slug] routes (Milestone C /
// item 17). Without it, a throw here (e.g. a malformed Excalidraw scene in a published canvas)
// escalates to the root error.tsx. These pages are seen by signed-out visitors, so no
// workspace-shell components — same standalone shape as not-found.tsx.
export default function ShareError({
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
      <Heading level="page">This shared page couldn&apos;t load</Heading>
      <p className="max-w-sm text-sm text-ink-500">
        Something went wrong displaying it. The link may be broken, or the
        content may have been unpublished.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-paper-200 px-3 py-2 text-sm text-ink-600 hover:bg-paper-100"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md bg-accent-500 px-3 py-2 text-sm font-medium text-white hover:bg-accent-600"
        >
          Go to CrowScribe
        </Link>
      </div>
    </div>
  );
}
