import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Permanently deletes the signed-in user's account via the `delete-account` Edge Function
// (service role: `auth.admin.deleteUser` + best-effort Storage cleanup; the `auth.users` row
// cascade removes the profile and every workspace the user owns).
//
// Throws `AccountDeletionBlockedError` (with the workspace names) when the user solely owns a
// shared workspace — there's no ownership transfer yet, so they must remove those members or
// delete those workspaces first. Callers should hard-confirm before calling this; it's
// irreversible. On success, sign the user out and send them to `/`.
export class AccountDeletionBlockedError extends Error {
  workspaces: string[];
  constructor(workspaces: string[]) {
    super(
      `You still own shared workspace${workspaces.length > 1 ? "s" : ""}: ${workspaces.join(
        ", ",
      )}. Remove the other members or delete these workspaces first.`,
    );
    this.name = "AccountDeletionBlockedError";
    this.workspaces = workspaces;
  }
}

export function useDeleteAccount() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{
        deleted?: boolean;
        blocked?: string;
        workspaces?: string[];
      }>("delete-account", { body: {} });
      if (error) throw error;
      if (data?.blocked === "shared-workspaces") {
        throw new AccountDeletionBlockedError(data.workspaces ?? []);
      }
      if (!data?.deleted) throw new Error("Account deletion did not complete.");

      // Hand the login page a one-shot flag before we sign out — AuthGate redirects to `/` the
      // instant the session clears (racing any router push we could do here), so a query param
      // wouldn't survive. sessionStorage does.
      try {
        sessionStorage.setItem("crowscribe:account-deleted", "1");
      } catch {
        // private-mode / storage disabled — the banner is a nicety, not load-bearing
      }

      // The `auth.users` row is gone; the local session token is now orphaned (still parses, but
      // every request 401s / RLS-filters to nothing). Clear it locally so the app treats the user
      // as signed out. `local` scope — the server-side session is already dead.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    },
    onSuccess: () => {
      // Drop every cached query so nothing from this account leaks into whatever renders next.
      queryClient.clear();
    },
  });
}
