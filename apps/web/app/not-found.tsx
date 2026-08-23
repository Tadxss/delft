import Link from "next/link";

// Next.js's file-based 404 boundary — renders for unmatched routes and for any segment
// that calls notFound() (e.g. share/[slug]/page.tsx on a missing/expired share link), which
// is often the first thing an unauthenticated visitor sees.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold text-ink-800">Page not found</h1>
      <p className="max-w-sm text-sm text-ink-500">
        The page you&apos;re looking for doesn&apos;t exist or the link may
        have expired.
      </p>
      <Link
        href="/"
        className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-paper-50 hover:bg-accent-600"
      >
        Go home
      </Link>
    </div>
  );
}
