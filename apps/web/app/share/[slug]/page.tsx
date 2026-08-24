import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Heading } from "../../_components/Heading";
import { SharedPageView } from "./_components/SharedPageViewLazy";
import { getSharedPage } from "./_lib/getSharedPage";

export const dynamic = "force-dynamic";

// The one route meant for external sharing — link previews (Slack, iMessage, etc.) read these
// tags when a share URL gets sent around. getSharedPage is wrapped in React's cache(), so this
// query and the page component's below share one Supabase round trip per request instead of two.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getSharedPage(slug);

  if (!page) return {};

  const title = page.title || "Untitled";
  return {
    title,
    description: `Shared via CrowScribe`,
    // Belt-and-suspenders with robots.ts's /share/ disallow rule — a well-behaved bot that
    // ignores robots.txt but still respects on-page directives won't index this anyway.
    robots: { index: false, follow: false },
    openGraph: { title, description: `Shared via CrowScribe`, type: "article" },
    twitter: { card: "summary", title, description: `Shared via CrowScribe` },
  };
}

export default async function SharedPagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getSharedPage(slug);

  if (!page) notFound();

  return (
    <main className="mx-auto max-w-3xl px-8 pb-16 pt-20">
      <Heading level="content-large" className="mb-8">
        {page.title || "Untitled"}
      </Heading>
      {/* Trusted content: only the signed-in workspace owner can ever author it, rendered here
          read-only (no toolbar/side menu/drag handles — see SharedPageView) for the published
          slug. Print-to-PDF from the browser is the intended export path for this view. */}
      <SharedPageView content={page.content} />
    </main>
  );
}
