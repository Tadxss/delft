"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  buildWorkspaceHref,
  useAcceptWorkspaceInvitation,
  useAuthUser,
  useDeclineWorkspaceInvitation,
  useInvitationPreview,
  workspaceInitials,
} from "@crowscribe/shared";
import { Button } from "../../_components/Button";
import { Heading } from "../../_components/Heading";

// Landing page for an invite link ({origin}/invite/{token}). The visitor is signed in (InviteLayout
// wraps AuthGate) but isn't a member yet, so the workspace name + inviter come from the
// token-guarded get_invitation_preview RPC. Accept/Decline call the same RPCs the picker's pending
// list uses.
export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const { user } = useAuthUser();
  const { data: preview, isLoading, isError } = useInvitationPreview(token);
  const accept = useAcceptWorkspaceInvitation(user?.id);
  const decline = useDeclineWorkspaceInvitation(user?.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 py-16">
      {isLoading ? (
        <p className="text-sm text-ink-400">Loading…</p>
      ) : isError || !preview ? (
        <>
          <Heading level="page">Invitation not found</Heading>
          <p className="text-sm text-ink-500">
            This invite link is invalid or has been removed.
          </p>
          <Link href="/workspace" className="text-sm text-accent-500 underline">
            Go to your workspaces
          </Link>
        </>
      ) : preview.status !== "pending" ? (
        <>
          <Heading level="page">
            {preview.status === "accepted"
              ? "Already accepted"
              : preview.status === "declined"
                ? "Invitation declined"
                : "Invitation revoked"}
          </Heading>
          <Link href="/workspace" className="text-sm text-accent-500 underline">
            Go to your workspaces
          </Link>
        </>
      ) : new Date(preview.expiresAt).getTime() < Date.now() ? (
        <>
          <Heading level="page">Invitation expired</Heading>
          <p className="text-sm text-ink-500">
            Ask {preview.inviterName} to send you a new one.
          </p>
          <Link href="/workspace" className="text-sm text-accent-500 underline">
            Go to your workspaces
          </Link>
        </>
      ) : (
        <div className="flex w-full flex-col items-center gap-5 rounded-lg border border-paper-200 bg-paper-50 p-8 text-center shadow-lg">
          <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-paper-100 text-base font-semibold text-ink-500">
            {preview.workspaceLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- small user-provided image
              <img
                src={preview.workspaceLogoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              workspaceInitials(preview.workspaceName)
            )}
          </span>
          <div className="flex flex-col gap-1">
            <Heading level="content-compact" as="h2">
              {preview.workspaceName}
            </Heading>
            <p className="text-sm text-ink-500">
              {preview.inviterName} invited you to join as {preview.role}.
            </p>
          </div>
          <div className="flex w-full gap-2">
            <Button
              className="flex-1"
              disabled={accept.isPending || decline.isPending}
              onClick={() =>
                accept.mutate(
                  { token },
                  {
                    onSuccess: (workspaceId) =>
                      router.replace(
                        buildWorkspaceHref({
                          id: workspaceId,
                          name: preview.workspaceName,
                        }),
                      ),
                  },
                )
              }
            >
              {accept.isPending ? "Joining…" : "Accept"}
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              disabled={accept.isPending || decline.isPending}
              onClick={() =>
                decline.mutate(
                  { token },
                  { onSuccess: () => router.replace("/workspace") },
                )
              }
            >
              Decline
            </Button>
          </div>
          {(accept.isError || decline.isError) && (
            <p className="text-xs text-red-700">
              {accept.error?.message ?? decline.error?.message}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
