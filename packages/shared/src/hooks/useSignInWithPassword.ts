import { useMutation } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Only works once a password has been set via useSetPassword — there is no separate
// email+password sign-up path, magic link (or Google) is still how an account is created.
export function useSignInWithPassword() {
  const supabase = useSupabaseClient();

  return useMutation<void, Error, { email: string; password: string }>({
    mutationFn: async ({ email, password }) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    },
  });
}
