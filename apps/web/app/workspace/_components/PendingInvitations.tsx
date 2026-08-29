"use client";

import { useRouter } from "next/navigation";
import {
  buildWorkspaceHref,
  useAcceptWorkspaceInvitation,
  useDeclineWorkspaceInvitation,
  useMyPendingInvitations,
  workspaceInitials,
} from "@crowscribe/shared";
import { Button } from "../../_components/Button";

// Workspace invitations addressed to the signed-in user, shown at the top of the picker. Renders
// nothing when there are none.
export function PendingInvitations({ userId }: { userId: string | undefined }) {
  const router = useRouter();
  const { data: invites } = useMyPendingInvitations(userId);
  const accept = useAcceptWorkspaceInvitation(userId);
  const decline = useDeclineWorkspaceInvitation(userId);

  if (!invites || invites.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-paper-200 bg-paper-100 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
        Pending invitations
      </p>
      <ul className="flex flex-col gap-2">
        {invites.map((inv) => (
          <li key={inv.id} className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-paper-200 text-[11px] font-semibold text-ink-500">
              {inv.workspaceLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- small user-provided image
                <img
                  src={inv.workspaceLogoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                workspaceInitials(inv.workspaceName)
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink-800">
                {inv.workspaceName}
              </p>
              <p className="truncate text-xs text-ink-400">
                {inv.invitedByName} invited you as {inv.role}
              </p>
            </div>
            <Button
              className="shrink-0"
              disabled={accept.isPending || decline.isPending}
              onClick={() =>
                accept.mutate(
                  { token: inv.token },
                  {
                    onSuccess: (workspaceId) =>
                      router.push(
                        buildWorkspaceHref({
                          id: workspaceId,
                          name: inv.workspaceName,
                        }),
                      ),
                  },
                )
              }
            >
              Accept
            </Button>
            <Button
              variant="secondary"
              className="shrink-0"
              disabled={accept.isPending || decline.isPending}
              onClick={() => decline.mutate({ token: inv.token })}
            >
              Decline
            </Button>
          </li>
        ))}
      </ul>
      {(accept.isError || decline.isError) && (
        <p className="text-xs text-red-700">
          {accept.error?.message ?? decline.error?.message}
        </p>
      )}
    </div>
  );
}
