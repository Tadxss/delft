import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@crowscribe/types";

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
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// Fetches the full column set once per request — generateMetadata() only reads `title` from the
// result, but React's cache() dedupes by argument (slug), not by which columns the caller uses, so
// both call sites in page.tsx share this single query instead of issuing two different-shaped ones
// (which Next's own request memoization wouldn't dedupe, since it keys on the request shape).
export const getSharedPage = cache(async (slug: string) => {
  const supabase = createAnonClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("pages")
    .select("title, content, updated_at")
    .eq("published_slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  return data;
});
