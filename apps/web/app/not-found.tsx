import Link from "next/link";
import { Heading } from "./_components/Heading";

// Next.js's file-based 404 boundary — renders for unmatched routes and for any segment
// that calls notFound() (e.g. share/[slug]/page.tsx on a missing/expired share link), which
// is often the first thing an unauthenticated visitor sees.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Heading level="page">Page not found</Heading>
      <p className="max-w-sm text-sm text-ink-500">
        The page you&apos;re looking for doesn&apos;t exist or the link may
        have expired.
      </p>
      <Link
        href="/"
        className="rounded-md bg-accent-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600"
      >
        Go home
      </Link>
    </div>
  );
}
