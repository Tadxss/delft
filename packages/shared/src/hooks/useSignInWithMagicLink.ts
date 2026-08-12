import { useMutation } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Email-only, no password (docs/plan: "auth is Supabase magic-link email only"). `emailRedirectTo`
// is optional — when omitted, Supabase falls back to `site_url` from supabase/config.toml (or the
// hosted project's Auth settings), which is enough for local dev; pass it explicitly if the caller
// needs to land somewhere other than the app root after clicking the emailed link.
export function useSignInWithMagicLink() {
  const supabase = useSupabaseClient();

  return useMutation<void, Error, { email: string; redirectTo?: string }>({
    mutationFn: async ({ email, redirectTo }) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
      });
      if (error) throw error;
    },
  });
}
