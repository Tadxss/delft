import { useMutation } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Plain full-page redirect: signInWithOAuth (no skipBrowserRedirect) navigates the current tab
// to Google itself, and the tab lands back on `redirectTo` with the session in the URL — exactly
// like magic link (implicit flow, `#access_token` hash, stripped by AuthHashCleanup). No popup.
export function useSignInWithGoogle() {
  const supabase = useSupabaseClient();

  return useMutation<void, Error, { redirectTo?: string } | void>({
    mutationFn: async (options) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: options?.redirectTo
          ? { redirectTo: options.redirectTo }
          : undefined,
      });
      if (error) throw error;
    },
  });
}
