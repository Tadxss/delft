import { useMutation } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Requires an active session (called from an already-signed-in account page) — Supabase's
// updateUser doesn't ask for the current password, since the session itself is the proof of
// identity here. Lets a magic-link/Google user add password sign-in as a faster future login.
export function useSetPassword() {
  const supabase = useSupabaseClient();

  return useMutation<void, Error, { password: string }>({
    mutationFn: async ({ password }) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
  });
}
