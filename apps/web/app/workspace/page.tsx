"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildWorkspaceHref,
  useAuthUser,
  useCreateWorkspace,
  useDeleteWorkspace,
  useLeaveWorkspace,
  useWorkspaces,
  workspaceInitials,
} from "@crowscribe/shared";
import { Button } from "../_components/Button";
import { FormLabel } from "../_components/FormLabel";
import { Heading } from "../_components/Heading";
import { Input } from "../_components/Input";
import { PendingInvitations } from "./_components/PendingInvitations";

export default function WorkspaceSwitcherPage() {
  const router = useRouter();
  const { user } = useAuthUser();
  const {
    data: workspaces,
    isLoading,
    isError,
    error,
  } = useWorkspaces(user?.id);
  const createWorkspace = useCreateWorkspace(user?.id);
  const deleteWorkspace = useDeleteWorkspace(user?.id);
  const leaveWorkspace = useLeaveWorkspace(user?.id);
  const [name, setName] = useState("");

  function handleLeave(
    e: React.MouseEvent,
    workspaceId: string,
    workspaceName: string,
  ) {
    e.stopPropagation();
    if (!window.confirm(`Leave "${workspaceName}"?`)) return;
    leaveWorkspace.mutate({ workspaceId });
  }

  function handleDelete(
    e: React.MouseEvent,
    workspaceId: string,
    workspaceName: string,
  ) {
    e.stopPropagation();
    if (
      !window.confirm(
        `Delete "${workspaceName}" and everything in it? This can't be undone.`,
      )
    ) {
      return;
    }
    deleteWorkspace.mutate({ id: workspaceId });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createWorkspace.mutate(
      { name: name.trim() },
      {
        onSuccess: (workspace) => {
          setName("");
          router.push(buildWorkspaceHref(workspace));
        },
      },
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-8 overflow-y-auto px-6 py-16">
      <Heading level="page">Workspaces</Heading>

      <PendingInvitations userId={user?.id} />

      {isLoading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-red-700">
          Couldn&apos;t load workspaces: {error.message}
        </p>
      ) : workspaces && workspaces.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {workspaces.map((workspace) => (
            <li key={workspace.id} className="group relative">
              <button
                type="button"
                onClick={() => router.push(buildWorkspaceHref(workspace))}
                className="flex w-full items-center gap-3 rounded-md border border-paper-200 bg-paper-100 px-4 py-3 pr-16 text-left text-sm text-ink-800 transition-colors hover:border-accent-500"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-paper-200 text-[11px] font-semibold text-ink-500">
                  {workspace.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small user-uploaded image with no build-time known dimensions; next/image's optimization isn't worth the config for this
                    <img
                      src={workspace.logoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    workspaceInitials(workspace.name)
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
              </button>
              {workspace.ownerId === user?.id ? (
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, workspace.id, workspace.name)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-ink-400 opacity-100 hover:bg-paper-200 hover:text-red-700 md:opacity-0 md:group-hover:opacity-100"
                >
                  Delete
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => handleLeave(e, workspace.id, workspace.name)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-ink-400 opacity-100 hover:bg-paper-200 hover:text-red-700 md:opacity-0 md:group-hover:opacity-100"
                >
                  Leave
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-500">
          No workspaces yet — create your first one below.
        </p>
      )}
      {deleteWorkspace.isError && (
        <p className="text-xs text-red-700">{deleteWorkspace.error.message}</p>
      )}
      {leaveWorkspace.isError && (
        <p className="text-xs text-red-700">{leaveWorkspace.error.message}</p>
      )}

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-2 border-t border-paper-200 pt-6"
      >
        <FormLabel htmlFor="workspace-name">New workspace</FormLabel>
        <div className="flex gap-2">
          <Input
            id="workspace-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Personal"
            maxLength={200}
            className="flex-1"
          />
          <Button type="submit" disabled={createWorkspace.isPending}>
            Create
          </Button>
        </div>
        {createWorkspace.isError && (
          <p className="text-xs text-red-700">
            {createWorkspace.error.message}
          </p>
        )}
      </form>
    </main>
  );
}
