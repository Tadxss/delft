import { useMutation } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Email-only, no password (docs/plan: "auth is Supabase magic-link email only"). `emailRedirectTo`
// is optional — when omitted, Supabase falls back to `site_url` from supabase/config.toml (or the
// hosted project's Auth settings), which is enough for local dev; pass it explicitly if the caller
// needs to land somewhere other than the app root after clicking the emailed link.
export function useSignInWithMagicLink() {
  const supabase = useSupabaseClient();

  return useMutation<
    void,
    Error,
    { email: string; redirectTo?: string; captchaToken?: string }
  >({
    mutationFn: async ({ email, redirectTo, captchaToken }) => {
      // signInWithOtp is the real account-creation call (magic link creates the user), so the
      // Turnstile token gates here when hosted has captcha enabled. Omit `options` entirely when
      // neither field is set so behaviour is unchanged where captcha isn't configured.
      const options: { emailRedirectTo?: string; captchaToken?: string } = {};
      if (redirectTo) options.emailRedirectTo = redirectTo;
      if (captchaToken) options.captchaToken = captchaToken;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: Object.keys(options).length > 0 ? options : undefined,
      });
      if (error) throw error;
    },
  });
}
