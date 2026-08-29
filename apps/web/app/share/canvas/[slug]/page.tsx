import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedCanvasView } from "./_components/SharedCanvasViewLazy";
import { getSharedCanvas } from "./_lib/getSharedCanvas";

export const dynamic = "force-dynamic";

// Public share route for a published canvas — mirrors share/[slug]/page.tsx (Pages). getSharedCanvas
// is wrapped in React's cache(), so this query and the component below share one Supabase round
// trip per request.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const canvas = await getSharedCanvas(slug);

  if (!canvas) return {};

  const title = canvas.title || "Untitled";
  return {
    title,
    description: `Shared via CrowScribe`,
    robots: { index: false, follow: false },
    openGraph: { title, description: `Shared via CrowScribe`, type: "article" },
    twitter: { card: "summary", title, description: `Shared via CrowScribe` },
  };
}

export default async function SharedCanvasPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const canvas = await getSharedCanvas(slug);

  if (!canvas) notFound();

  // Trusted content: only the signed-in workspace owner can author it, rendered here read-only
  // (viewModeEnabled — no tools, pan/zoom only) for the published slug.
  return <SharedCanvasView scene={canvas.scene} />;
}
