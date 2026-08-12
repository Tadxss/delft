"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildWorkspaceHref, useAuthUser, useCreateWorkspace, useWorkspaces } from "@delft/shared";

export default function WorkspaceSwitcherPage() {
  const router = useRouter();
  const { user } = useAuthUser();
  const { data: workspaces, isLoading } = useWorkspaces(user?.id);
  const createWorkspace = useCreateWorkspace(user?.id);
  const [name, setName] = useState("");

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
      ) : workspaces && workspaces.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <button
                type="button"
                onClick={() => router.push(buildWorkspaceHref(workspace))}
                className="w-full rounded-md border border-paper-200 bg-paper-100 px-4 py-3 text-left text-sm text-ink-800 transition-colors hover:border-accent-500"
              >
                {workspace.name}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-500">No workspaces yet — create your first one below.</p>
      )}

      <form onSubmit={handleCreate} className="flex flex-col gap-2 border-t border-paper-200 pt-6">
        <label htmlFor="workspace-name" className="text-xs font-medium uppercase tracking-wide text-ink-500">
          New workspace
        </label>
        <div className="flex gap-2">
          <input
            id="workspace-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Personal"
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
          <p className="text-xs text-red-700">{createWorkspace.error.message}</p>
        )}
      </form>
    </main>
  );
}
