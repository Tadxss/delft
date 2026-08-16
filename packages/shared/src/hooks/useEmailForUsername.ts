import { useMutation } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Resolves a username to its account's email via the get_email_for_username RPC — needed because
// Supabase's signInWithPassword only ever accepts an email (or phone), never a username, so this
// has to run BEFORE the sign-in page can call it. Callable while signed out (the RPC is granted to
// anon) — see supabase/migrations/20260817000010_username_lookup_rpc.sql for the accepted
// disclosure tradeoff this implies. Resolves to `null` (not an error) when the username doesn't
// match any account.
export function useEmailForUsername() {
  const supabase = useSupabaseClient();

  return useMutation<string | null, Error, string>({
    mutationFn: async (username) => {
      const { data, error } = await supabase.rpc("get_email_for_username", {
        p_username: username,
      });
      if (error) throw error;
      return data;
    },
  });
}
