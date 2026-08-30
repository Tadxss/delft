"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { Heading } from "../_components/Heading";

// Error boundary for /invite/[token] (Milestone C / item 17) — token-preview / accept RPC
// failures land here instead of the root boundary. Renders inside invite/layout.tsx's AuthGate.
export default function InviteError({
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
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <Heading level="page">This invitation couldn&apos;t load</Heading>
      <p className="max-w-sm text-sm text-ink-500">
        Something went wrong. The link may be expired or already used.
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
          href="/workspace"
          className="rounded-md bg-accent-500 px-3 py-2 text-sm font-medium text-white hover:bg-accent-600"
        >
          Go to your workspaces
        </Link>
      </div>
    </div>
  );
}
