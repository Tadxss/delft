"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Next.js's root-layout error boundary — catches a crash inside the root layout itself
// (e.g. ThemeProvider/Providers in app/layout.tsx), which app/error.tsx can't catch since
// that only covers segments below the layout. Must render its own <html>/<body> and can't
// assume globals.css or ThemeProvider are available, since either could be what crashed.
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#fafaf9",
          color: "#292524",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
          Something went wrong.
        </h1>
        <p
          style={{
            maxWidth: "24rem",
            fontSize: "0.875rem",
            color: "#78716c",
            margin: 0,
          }}
        >
          We hit an unexpected problem. Try again, or come back in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            borderRadius: "0.375rem",
            backgroundColor: "#292524",
            color: "#fafaf9",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
