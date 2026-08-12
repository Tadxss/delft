import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@delft/types";
import { SharedPageView } from "./_components/SharedPageView";

export const dynamic = "force-dynamic";

// A plain anon-key client, no session/storage adapter — this route is intentionally public and
// unauthenticated. It only ever reaches rows the pages_select_published_anon RLS policy (see
// supabase/migrations) permits: `is_published = true`, no workspace check. The `.eq("is_published",
// true)` filter below is redundant with that policy but kept anyway — defense in depth, and it
// means this route's own intent reads clearly without having to cross-reference the migration.
function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export default async function SharedPagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createAnonClient();
  if (!supabase) notFound();

  const { data: page } = await supabase
    .from("pages")
    .select("title, content, updated_at")
    .eq("published_slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (!page) notFound();

  return (
    <main className="mx-auto max-w-3xl px-8 pb-16 pt-20">
      <h1 className="mb-8 text-3xl font-bold text-ink-800">{page.title || "Untitled"}</h1>
      {/* Trusted content: only the signed-in workspace owner can ever author it, rendered here
          read-only (no toolbar/side menu/drag handles — see SharedPageView) for the published
          slug. Print-to-PDF from the browser is the intended export path for this view. */}
      <SharedPageView content={page.content} />
    </main>
  );
}
