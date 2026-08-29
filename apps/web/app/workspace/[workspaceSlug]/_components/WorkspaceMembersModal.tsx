"use client";

import { useEffect, useState } from "react";
import { Check, Copy, User, X } from "lucide-react";
import type { InvitableRole } from "@crowscribe/types";
import {
  useAuthUser,
  useInviteToWorkspace,
  useRemoveWorkspaceMember,
  useRevokeWorkspaceInvitation,
  useSetWorkspaceMemberRole,
  useWorkspaceInvitations,
  useWorkspaceMembers,
} from "@crowscribe/shared";
import { Button } from "../../../_components/Button";
import { FormLabel } from "../../../_components/FormLabel";
import { Input, Select } from "../../../_components/Input";
import { Modal } from "../../../_components/Modal";

// Owner-only. Opened from the SidebarHeader dropdown. Invite people by email or @username, manage
// existing members' roles / removal, and revoke pending invites. The magic-link email for
// brand-new invitees is a later pass — for now the owner shares the copy-link.
export function WorkspaceMembersModal({
  workspaceId,
  open,
  onClose,
}: {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuthUser();
  const members = useWorkspaceMembers(open ? workspaceId : undefined);
  const invitations = useWorkspaceInvitations(open ? workspaceId : undefined);
  const invite = useInviteToWorkspace(workspaceId);
  const setRole = useSetWorkspaceMemberRole(workspaceId);
  const removeMember = useRemoveWorkspaceMember(workspaceId);
  const revoke = useRevokeWorkspaceInvitation(workspaceId);

  const [target, setTarget] = useState("");
  const [role, setRoleValue] = useState<InvitableRole>("editor");
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTarget("");
      setRoleValue("editor");
      setLastLink(null);
      setCopied(null);
    }
  }, [open]);

  function inviteLink(token: string) {
    return typeof window === "undefined"
      ? ""
      : `${window.location.origin}/invite/${token}`;
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = target.trim();
    if (!trimmed) return;
    const asUsername = trimmed.startsWith("@")
      ? trimmed.slice(1)
      : trimmed.includes("@")
        ? undefined
        : trimmed;
    invite.mutate(
      asUsername !== undefined
        ? { username: asUsername, role }
        : { email: trimmed, role },
      {
        onSuccess: (row) => {
          setTarget("");
          setLastLink(inviteLink(row.token));
        },
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} widthClassName="max-w-md">
      <div className="flex shrink-0 items-center justify-between border-b border-paper-200 px-4 py-2">
        <span className="text-sm font-medium text-ink-800">Members</span>
        <Button variant="ghost" onClick={onClose} aria-label="Close">
          <X size={16} />
        </Button>
      </div>

      <div className="flex flex-col gap-6 overflow-y-auto p-4">
        {/* Invite */}
        <form onSubmit={handleInvite} className="flex flex-col gap-2">
          <FormLabel htmlFor="member-invite">Invite someone</FormLabel>
          <div className="flex gap-2">
            <Input
              id="member-invite"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="email or @username"
              className="min-w-0 flex-1"
            />
            <Select
              aria-label="Role"
              value={role}
              onChange={(e) => setRoleValue(e.target.value as InvitableRole)}
              className="w-28"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </Select>
            <Button type="submit" disabled={!target.trim() || invite.isPending}>
              {invite.isPending ? "…" : "Invite"}
            </Button>
          </div>
          <p className="-mt-1 text-xs text-ink-400">
            Editors can create and edit pages &amp; canvases; viewers are
            read-only. The credentials vault stays owner-only.
          </p>
          {invite.isError && (
            <p className="text-xs text-red-700">{invite.error.message}</p>
          )}
          {lastLink && (
            <div className="flex items-center gap-2 rounded-md border border-paper-200 bg-paper-100 px-3 py-2 text-xs text-ink-600">
              <span className="truncate">{lastLink}</span>
              <button
                type="button"
                onClick={() => copy(lastLink)}
                className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-ink-500 hover:bg-paper-50 hover:text-ink-800"
              >
                {copied === lastLink ? <Check size={13} /> : <Copy size={13} />}
                {copied === lastLink ? "Copied" : "Copy link"}
              </button>
            </div>
          )}
        </form>

        {/* Members */}
        <div className="flex flex-col gap-2">
          <FormLabel>People</FormLabel>
          {members.isLoading ? (
            <p className="text-xs text-ink-400">Loading…</p>
          ) : members.isError ? (
            <p className="text-xs text-red-700">{members.error.message}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {(members.data ?? []).map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center gap-2.5 rounded-md px-1 py-1.5"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-paper-200 bg-paper-100">
                    {m.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- small user avatar, no build-time dimensions
                      <img
                        src={m.avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <User size={14} className="text-ink-400" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-800">
                      {m.displayName ?? m.username ?? m.email ?? "Member"}
                      {m.userId === user?.id && (
                        <span className="text-ink-400"> (you)</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-ink-400">
                      {m.username ? `@${m.username}` : m.email}
                    </p>
                  </div>
                  {m.role === "owner" ? (
                    <span className="shrink-0 rounded bg-paper-100 px-2 py-1 text-xs text-ink-500">
                      Owner
                    </span>
                  ) : (
                    <>
                      <Select
                        aria-label={`Role for ${m.displayName ?? m.username ?? "member"}`}
                        value={m.role}
                        onChange={(e) =>
                          setRole.mutate({
                            userId: m.userId,
                            role: e.target.value as InvitableRole,
                          })
                        }
                        className="w-24 shrink-0"
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </Select>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${m.displayName ?? m.username ?? "this member"} from the workspace?`,
                            )
                          ) {
                            removeMember.mutate({ userId: m.userId });
                          }
                        }}
                        className="shrink-0 rounded px-1.5 py-1 text-xs text-ink-400 hover:bg-paper-100 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(setRole.isError || removeMember.isError) && (
            <p className="text-xs text-red-700">
              {setRole.error?.message ?? removeMember.error?.message}
            </p>
          )}
        </div>

        {/* Pending invitations */}
        {(invitations.data ?? []).length > 0 && (
          <div className="flex flex-col gap-2">
            <FormLabel>Pending invitations</FormLabel>
            <ul className="flex flex-col gap-1">
              {(invitations.data ?? []).map((inv) => {
                const link = inviteLink(inv.token);
                return (
                  <li
                    key={inv.id}
                    className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-ink-700">
                      {inv.invitedUsername
                        ? `@${inv.invitedUsername}`
                        : inv.invitedEmail}
                    </span>
                    <span className="shrink-0 text-xs text-ink-400">
                      {inv.role}
                    </span>
                    <button
                      type="button"
                      onClick={() => copy(link)}
                      aria-label="Copy invite link"
                      className="shrink-0 rounded px-1.5 py-0.5 text-ink-400 hover:bg-paper-100 hover:text-ink-700"
                    >
                      {copied === link ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => revoke.mutate({ invitationId: inv.id })}
                      className="shrink-0 rounded px-1.5 py-0.5 text-xs text-ink-400 hover:bg-paper-100 hover:text-red-700"
                    >
                      Revoke
                    </button>
                  </li>
                );
              })}
            </ul>
            {revoke.isError && (
              <p className="text-xs text-red-700">{revoke.error.message}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
