import { useMutation } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

// Re-fires the invitation email for a still-pending email invite (Build Order step 94). The
// `send-invitation-email` Edge Function is already idempotent — it re-checks the caller is the
// inviter or the workspace owner, that the invite is pending with an email, and enforces a 60s
// per-invite throttle — so this just invokes it again with the same token and surfaces the
// result. No row changes (it bumps `last_emailed_at`, which the owner's list doesn't show), so
// no cache invalidation.
export function useResendWorkspaceInvitation() {
  const supabase = useSupabaseClient();

  return useMutation<void, Error, { token: string }>({
    mutationFn: async ({ token }) => {
      const { data, error } = await supabase.functions.invoke(
        "send-invitation-email",
        { body: { token } },
      );
      // Non-2xx (FunctionsHttpError) — the function's own 400/500 error paths.
      if (error) {
        throw new Error("Couldn't resend the invitation. Try again.");
      }
      const skipped = (data as { skipped?: string } | null)?.skipped;
      if (skipped === "throttled") {
        throw new Error("Just sent — wait a minute before resending.");
      }
      if (skipped === "not-authorized") {
        throw new Error("You can't resend this invitation.");
      }
      if (skipped === "not-pending") {
        throw new Error("This invitation is no longer pending.");
      }
      // `sent`, `no-api-key` (local/CI), `no-email` — treat as done.
    },
  });
}
