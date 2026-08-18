"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildWorkspaceHref,
  useAuthUser,
  useCreateWorkspace,
  useDeleteWorkspace,
  useWorkspaces,
} from "@delft/shared";

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
  const [name, setName] = useState("");

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
    <main className="mx-auto flex w-full max-w-lg flex-col gap-8 px-6 py-16">
      <h1 className="text-2xl font-semibold text-ink-800">Workspaces</h1>

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
                className="w-full rounded-md border border-paper-200 bg-paper-100 px-4 py-3 pr-16 text-left text-sm text-ink-800 transition-colors hover:border-accent-500"
              >
                {workspace.name}
              </button>
              {workspace.ownerId === user?.id && (
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, workspace.id, workspace.name)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-ink-400 opacity-100 hover:bg-paper-200 hover:text-red-700 md:opacity-0 md:group-hover:opacity-100"
                >
                  Delete
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

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-2 border-t border-paper-200 pt-6"
      >
        <label
          htmlFor="workspace-name"
          className="text-xs font-medium uppercase tracking-wide text-ink-500"
        >
          New workspace
        </label>
        <div className="flex gap-2">
          <input
            id="workspace-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Personal"
            maxLength={200}
            className="flex-1 rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
          />
          <button
            type="submit"
            disabled={createWorkspace.isPending}
            className="rounded-md bg-ink-800 px-4 py-2 text-sm font-medium text-paper-50 hover:bg-ink-700 disabled:opacity-60"
          >
            Create
          </button>
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
