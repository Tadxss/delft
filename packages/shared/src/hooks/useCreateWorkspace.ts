import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Workspace } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapWorkspaceRow } from "../supabase/mappers";

// Plain RLS-gated insert (workspaces_insert_own), not an RPC — the only server-side side effect
// (auto-enrolling the creator into workspace_members as 'owner') happens in the
// handle_new_workspace() trigger, so the client only ever needs to insert the workspace row
// itself.
export function useCreateWorkspace(userId: string | undefined) {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Workspace, Error, { name: string }>({
    mutationFn: async ({ name }) => {
      if (!userId) throw new Error("NOT_SIGNED_IN");
      const { data, error } = await supabase
        .from("workspaces")
        .insert({ owner_id: userId, name })
        .select()
        .single();
      if (error) {
        // 23503 on this specific insert means `owner_id` (the current session's user id) no
        // longer exists in auth.users — only possible in local dev, when the database has been
        // reset out from under a still-open browser session. The JWT itself is still
        // cryptographically valid, so the client thinks it's signed in; only a real write like
        // this exposes the mismatch. Signing out clears the stale session and (via AuthGate)
        // sends the user back to sign in fresh, which is the only real fix.
        if (error.code === "23503") {
          await supabase.auth.signOut();
          throw new Error(
            "Your session is out of date — please sign in again.",
          );
        }
        throw error;
      }
      return mapWorkspaceRow(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", userId] });
    },
  });
}
