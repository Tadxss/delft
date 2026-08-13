"use client";

import { useMemo, useState } from "react";
import type { Credential } from "@delft/types";

export function CredentialList({
  credentials,
  selectedId,
  onSelect,
  onNew,
}: {
  credentials: Credential[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return credentials;
    return credentials.filter(
      (c) => c.title.toLowerCase().includes(query) || c.url?.toLowerCase().includes(query),
    );
  }, [credentials, search]);

  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-paper-200">
      <div className="flex items-center justify-between gap-2 border-b border-paper-200 p-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="min-w-0 flex-1 rounded-md border border-paper-200 bg-paper-50 px-2 py-1.5 text-sm text-ink-800 outline-none focus:border-accent-500"
        />
        <button
          type="button"
          onClick={onNew}
          aria-label="New credential"
          className="shrink-0 rounded-md px-2 py-1.5 text-sm text-ink-500 hover:bg-paper-100 hover:text-ink-800"
        >
          +
        </button>
      </div>
      {filtered.length === 0 ? (
        <p className="p-3 text-sm text-ink-400">
          {credentials.length === 0 ? "No credentials yet." : "No matches."}
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {filtered.map((credential) => (
            <li key={credential.id}>
              <button
                type="button"
                onClick={() => onSelect(credential.id)}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-paper-100 px-3 py-2 text-left ${
                  selectedId === credential.id ? "bg-paper-100" : "hover:bg-paper-50"
                }`}
              >
                <span className="truncate text-sm font-medium text-ink-800">
                  {credential.title || "Untitled"}
                </span>
                {credential.url && (
                  <span className="truncate text-xs text-ink-400">{credential.url}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
