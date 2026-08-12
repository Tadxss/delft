import { useMutation } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// skipBrowserRedirect leaves navigation to the caller — app/page.tsx opens the returned URL in a
// popup rather than navigating the whole tab away. The popup's own fresh supabase-js instance
// completes the PKCE exchange and writes the session to localStorage; GoTrueClient's
// BroadcastChannel (keyed by storageKey, see supabase/client.ts) then notifies this tab's client
// automatically — no polling or postMessage plumbing needed here.
export function useSignInWithGoogle() {
  const supabase = useSupabaseClient();

  return useMutation<string, Error, { redirectTo?: string } | void>({
    mutationFn: async (options) => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          skipBrowserRedirect: true,
          ...(options?.redirectTo ? { redirectTo: options.redirectTo } : undefined),
        },
      });
      if (error) throw error;
      return data.url;
    },
  });
}
