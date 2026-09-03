"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  parseWorkspaceSlug,
  useAuthUser,
  useRequestVaultReset,
  useWorkspace,
} from "@crowscribe/shared";
import { Button } from "../../../_components/Button";
import { Heading } from "../../../_components/Heading";

// Last resort: reachable only from ForgotPassphrasePanel's "Lost your recovery key too?" link,
// meaning both the passphrase and the recovery key are gone. A real route rather than modal state
// — bookmarkable/linkable from the confirmation email, survives a reload between request and
// confirm. Resets only the *calling member's* own vault in this workspace (per-member vaults,
// Build Order step 92) — enforced server-side by vault_reset_requests' insert RLS + the
// reset_vault RPC's `user_id = auth.uid()` scoping.
export default function VaultResetRequestPage() {
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceId = parseWorkspaceSlug(params.workspaceSlug);
  const { data: workspace } = useWorkspace(workspaceId);
  const { user } = useAuthUser();
  const requestReset = useRequestVaultReset();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequest() {
    if (!user?.email) return;
    setError(null);
    try {
      const confirmUrl = `${window.location.origin}${window.location.pathname}/confirm`;
      await requestReset.mutateAsync({
        workspaceId,
        email: user.email,
        confirmUrl,
      });
      setSent(true);
    } catch {
      setError("Couldn't start the reset. Try again.");
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-10 text-sm">
      <Heading level="page">
        Reset your vault in {workspace?.name ?? "this workspace"}
      </Heading>
      <p className="mt-3 text-ink-500">
        Use this only if you&apos;ve lost both this vault&apos;s passphrase{" "}
        <em>and</em> its recovery key. This permanently deletes every credential
        currently stored in this vault — there is no way to recover them
        afterward. You&apos;ll then be able to set up the vault again from
        scratch.
      </p>
      {sent ? (
        <p className="mt-4 rounded-md border border-paper-200 bg-paper-100 px-3 py-2 text-ink-800">
          Check your email for a confirmation link. It expires in an hour.
        </p>
      ) : (
        <>
          <Button
            variant="destructive"
            onClick={handleRequest}
            disabled={requestReset.isPending}
            className="mt-4"
          >
            {requestReset.isPending
              ? "Sending…"
              : "Email me a reset confirmation link"}
          </Button>
          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        </>
      )}
    </main>
  );
}
