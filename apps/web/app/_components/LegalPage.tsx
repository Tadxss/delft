import type { ReactNode } from "react";
import Link from "next/link";
import { Heading } from "./Heading";

// Shared shell for the public legal/contact routes (/privacy, /terms, /contact). These render
// outside the auth shell (no Sidebar/TopBar) — just the root layout's ThemeProvider — and are the
// only intentionally search-indexable pages besides the landing page. Typography is hand-styled
// via arbitrary child selectors rather than pulling in @tailwindcss/typography for three pages.
const PROSE =
  "text-sm leading-relaxed text-ink-600 " +
  "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink-800 " +
  "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-ink-800 " +
  "[&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1.5 " +
  "[&_a]:text-accent-500 [&_a]:underline [&_strong]:font-semibold [&_strong]:text-ink-800 " +
  "[&_table]:my-4 [&_table]:w-full [&_table]:text-left [&_th]:py-1 [&_th]:pr-4 [&_th]:align-top " +
  "[&_th]:font-semibold [&_th]:text-ink-800 [&_td]:py-1 [&_td]:pr-4 [&_td]:align-top";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-16">
      <Link
        href="/"
        className="mb-10 flex items-center gap-2 text-sm font-semibold tracking-tight text-ink-800"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- our own generated /icon PNG */}
        <img src="/icon" width={20} height={20} alt="" className="rounded" />
        CrowScribe
      </Link>

      <Heading level="page">{title}</Heading>
      {updated && (
        <p className="mt-2 text-xs text-ink-400">Last updated: {updated}</p>
      )}

      <div className={`mt-8 ${PROSE}`}>{children}</div>

      <footer className="mt-16 border-t border-paper-200 pt-6 text-xs text-ink-400">
        <Link href="/" className="hover:text-ink-600">
          Home
        </Link>
        <span className="px-2">·</span>
        <Link href="/privacy" className="hover:text-ink-600">
          Privacy
        </Link>
        <span className="px-2">·</span>
        <Link href="/terms" className="hover:text-ink-600">
          Terms
        </Link>
        <span className="px-2">·</span>
        <Link href="/contact" className="hover:text-ink-600">
          Contact
        </Link>
      </footer>
    </main>
  );
}
