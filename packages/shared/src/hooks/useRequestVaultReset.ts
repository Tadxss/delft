import { useMutation } from "@tanstack/react-query";
import { useSupabaseClient } from "../supabase/context";

function generateResetToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Starts a last-resort vault reset (Part 3 — only reachable when both the passphrase and the
// recovery key are lost): inserts a row into vault_reset_requests (owner-only RLS, see
// supabase/migrations/20260822160053_vault_reset_requests.sql) and emails a confirmation link via
// the app's existing magic-link mechanism — the same supabase.auth.signInWithOtp
// useSignInWithMagicLink.ts uses, called directly here rather than composing that hook, since a
// mutationFn can't call another hook. Clicking the emailed link is what (re-)establishes the
// session the confirm page requires — see vault-reset/confirm/page.tsx.
export function useRequestVaultReset() {
  const supabase = useSupabaseClient();

  return useMutation<
    void,
    Error,
    { workspaceId: string; email: string; confirmUrl: string }
  >({
    mutationFn: async ({ workspaceId, email, confirmUrl }) => {
      const token = generateResetToken();
      const { error: insertError } = await supabase
        .from("vault_reset_requests")
        .insert({ workspace_id: workspaceId, token });
      if (insertError) throw insertError;

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${confirmUrl}?token=${token}` },
      });
      if (otpError) throw otpError;
    },
  });
}
