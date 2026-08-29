import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@crowscribe/types";

// A plain anon-key client, no session/storage adapter — this route is intentionally public and
// unauthenticated. Mirrors share/[slug]/_lib/getSharedPage.ts exactly; it only ever reaches rows
// the canvases_select_published_anon RLS policy permits (`is_published = true`, no workspace
// check). The `.eq("is_published", true)` below is redundant with that policy but kept as defense
// in depth and so this route's intent reads clearly on its own.
function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// Wrapped in React's cache() so generateMetadata() and the page component share one Supabase
// round trip per request (deduped by slug) — same rationale as getSharedPage.
export const getSharedCanvas = cache(async (slug: string) => {
  const supabase = createAnonClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("canvases")
    .select("title, scene, updated_at")
    .eq("published_slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  return data;
});
