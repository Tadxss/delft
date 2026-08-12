import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

export function useSignOut() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      // Every workspace/page query is scoped to the signed-in user via RLS — once the session is
      // gone, cached data from it must not leak into whatever renders next (e.g. the login page,
      // or a different account signing in on the same device).
      queryClient.clear();
    },
  });
}
