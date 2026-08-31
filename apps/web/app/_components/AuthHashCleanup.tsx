"use client";

import { useEffect } from "react";
import { useSupabaseClient } from "@crowscribe/shared";

// The magic-link callback lands the browser on `…/#access_token=<jwt>&refresh_token=…`.
// supabase-js's `detectSessionInUrl` consumes that hash and clears it via `history.replaceState`
// during its async `initialize()` — but in a production build Next's App Router captures the URL
// (hash included) at hydration, *before* that runs, then re-asserts it on the next client
// navigation. The upshot: after login (and even after sign-out) a still-valid access token can
// linger in the URL bar, history, and referrer headers. `next dev`'s slower hydration happened
// to let supabase win the race, so this only showed up once CI started serving a real build.
//
// So: drop any auth hash on each `onAuthStateChange` — that only fires *after* supabase-js has
// finished reading the URL (the initial `INITIAL_SESSION`/`SIGNED_IN`, and later `SIGNED_OUT`),
// so it never races the token read out from under sign-in. `window.history` is patched by the
// App Router, so this keeps Next's canonical URL in sync too.
export function AuthHashCleanup() {
  const supabase = useSupabaseClient();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      const hash = window.location.hash;
      if (hash.includes("access_token") || hash.includes("error=")) {
        window.history.replaceState(
          window.history.state,
          "",
          window.location.pathname + window.location.search,
        );
      }
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  return null;
}
