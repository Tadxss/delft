"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  buildWorkspaceHref,
  parseWorkspaceSlug,
  useConfirmVaultReset,
  useWorkspace,
} from "@crowscribe/shared";
import { Button } from "../../../../_components/Button";
import { Heading } from "../../../../_components/Heading";

// Reached by clicking the emailed link from vault-reset/page.tsx. Nested under the same AuthGate
// as every other workspace route, so simply landing here (after the magic link (re-)establishes a
// session) already satisfies "active session AND a clicked email link" as one mechanism — no
// separate auth check needed here. The actual delete only happens on an explicit final click below
// (never on page load), so an email client's link-prefetcher loading this page harmlessly does
// nothing — the token stays valid until someone deliberately clicks through.
function ConfirmVaultResetContent() {
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceId = parseWorkspaceSlug(params.workspaceSlug);
  const token = useSearchParams().get("token");
  const { data: workspace } = useWorkspace(workspaceId);
  const confirmReset = useConfirmVaultReset();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!token) return;
    setError(null);
    try {
      await confirmReset.mutateAsync({ workspaceId, token });
      if (workspace) router.push(buildWorkspaceHref(workspace));
    } catch {
      setError(
        "This reset link is invalid, expired, or already used. Request a new one.",
      );
    }
  }

  if (!token) {
    return (
      <main className="mx-auto max-w-md px-6 py-10 text-sm text-red-700">
        This link is missing its reset token.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-10 text-sm">
      <Heading level="page">Confirm vault reset</Heading>
      <p className="mt-3 text-ink-500">
        This will permanently delete every credential currently stored in{" "}
        {workspace?.name ?? "this workspace"}&apos;s vault. This cannot be
        undone.
      </p>
      <Button
        variant="destructive"
        onClick={handleConfirm}
        disabled={confirmReset.isPending}
        className="mt-4"
      >
        {confirmReset.isPending
          ? "Deleting…"
          : "Yes, delete everything in this vault"}
      </Button>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </main>
  );
}

export default function ConfirmVaultResetPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmVaultResetContent />
    </Suspense>
  );
}
