"use client";

import { useEffect, useState } from "react";
import type { Credential, CredentialSecret } from "@delft/types";
import {
  decryptSecret,
  encryptSecret,
  generatePassword,
  useCreateCredential,
  useDeleteCredential,
  useUpdateCredential,
} from "@delft/shared";

const EMPTY_SECRET: CredentialSecret = { username: "", password: "", notes: "" };

interface FormState {
  title: string;
  url: string;
  username: string;
  password: string;
  notes: string;
}

function toFormState(title: string, url: string | null, secret: CredentialSecret): FormState {
  return { title, url: url ?? "", username: secret.username, password: secret.password, notes: secret.notes };
}

export function CredentialDetail({
  workspaceId,
  credential,
  vaultKey,
  onSaved,
  onDeleted,
}: {
  workspaceId: string;
  credential: Credential | null; // null means "creating a new credential"
  vaultKey: CryptoKey;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const isNew = credential === null;
  const createCredential = useCreateCredential();
  const updateCredential = useUpdateCredential();
  const deleteCredential = useDeleteCredential();

  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<FormState>(toFormState("", null, EMPTY_SECRET));
  const [showPassword, setShowPassword] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"username" | "password" | null>(null);

  useEffect(() => {
    setDecryptError(null);
    setShowPassword(false);
    setCopied(null);

    if (isNew || !credential) {
      setEditing(true);
      setForm(toFormState("", null, EMPTY_SECRET));
      return;
    }

    setEditing(false);
    let cancelled = false;
    decryptSecret(vaultKey, credential.secretCiphertext, credential.secretIv)
      .then((secret) => {
        if (!cancelled) setForm(toFormState(credential.title, credential.url, secret));
      })
      .catch(() => {
        if (!cancelled) setDecryptError("Couldn't decrypt — check your vault passphrase.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the selected credential changes
  }, [credential?.id, vaultKey]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const secret: CredentialSecret = {
      username: form.username,
      password: form.password,
      notes: form.notes,
    };
    const { ciphertext, iv } = await encryptSecret(vaultKey, secret);
    const url = form.url.trim() || null;

    if (isNew) {
      createCredential.mutate(
        { workspaceId, title: form.title, url, secretCiphertext: ciphertext, secretIv: iv },
        { onSuccess: (created) => onSaved(created.id) },
      );
    } else if (credential) {
      updateCredential.mutate(
        { id: credential.id, title: form.title, url, secretCiphertext: ciphertext, secretIv: iv },
        { onSuccess: () => setEditing(false) },
      );
    }
  }

  function handleDelete() {
    if (!credential) return;
    if (!window.confirm(`Delete "${credential.title || "this credential"}"?`)) return;
    deleteCredential.mutate({ id: credential.id, workspaceId }, { onSuccess: onDeleted });
  }

  function handleGenerate() {
    const password = generatePassword({
      length: 20,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: true,
    });
    setForm((prev) => ({ ...prev, password }));
    setShowPassword(true);
  }

  async function handleCopy(field: "username" | "password") {
    await navigator.clipboard.writeText(field === "username" ? form.username : form.password);
    setCopied(field);
    setTimeout(() => setCopied((current) => (current === field ? null : current)), 2000);
  }

  const isSaving = createCredential.isPending || updateCredential.isPending;
  const saveError = createCredential.error ?? updateCredential.error;

  if (decryptError) {
    return <p className="p-6 text-sm text-red-700">{decryptError}</p>;
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="flex max-w-lg flex-col gap-3 p-6">
        <label htmlFor="title" className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Title
        </label>
        <input
          id="title"
          required
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        />

        <label htmlFor="url" className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Website
        </label>
        <input
          id="url"
          type="url"
          value={form.url}
          onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
          placeholder="https://example.com"
          className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        />

        <label htmlFor="username" className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Username
        </label>
        <input
          id="username"
          value={form.username}
          onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
          className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        />

        <label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Password
        </label>
        <div className="flex gap-2">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            className="min-w-0 flex-1 rounded-md border border-paper-200 bg-paper-50 px-3 py-2 font-mono text-sm text-ink-800 outline-none focus:border-accent-500"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="shrink-0 rounded-md border border-paper-200 px-2 py-1.5 text-xs text-ink-600 hover:bg-paper-50"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            className="shrink-0 rounded-md border border-paper-200 px-2 py-1.5 text-xs text-ink-600 hover:bg-paper-50"
          >
            Generate
          </button>
        </div>

        <label htmlFor="notes" className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Notes
        </label>
        <textarea
          id="notes"
          value={form.notes}
          onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          rows={4}
          className="resize-y rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        />

        <div className="mt-2 flex items-center gap-2">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-md bg-ink-800 px-3 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
          {!isNew && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-paper-200 px-3 py-2 text-sm text-ink-600 hover:bg-paper-50"
            >
              Cancel
            </button>
          )}
        </div>
        {saveError && <p className="text-xs text-red-700">{saveError.message}</p>}
      </form>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-2xl font-bold text-ink-800">{form.title || "Untitled"}</h2>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-paper-300 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-paper-100"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteCredential.isPending}
            className="rounded-md px-2 py-1.5 text-xs text-ink-400 hover:bg-paper-100 hover:text-red-700"
          >
            Delete
          </button>
        </div>
      </div>

      {credential?.url && (
        <a
          href={credential.url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-sm text-accent-500 underline"
        >
          {credential.url}
        </a>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-500">Username</span>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{form.username || "—"}</span>
          <button
            type="button"
            onClick={() => handleCopy("username")}
            className="shrink-0 rounded-md border border-paper-200 px-2 py-1 text-xs text-ink-600 hover:bg-paper-50"
          >
            {copied === "username" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-500">Password</span>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink-800">
            {showPassword ? form.password || "—" : "•".repeat(Math.max(form.password.length, 8))}
          </span>
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="shrink-0 rounded-md border border-paper-200 px-2 py-1 text-xs text-ink-600 hover:bg-paper-50"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            onClick={() => handleCopy("password")}
            className="shrink-0 rounded-md border border-paper-200 px-2 py-1 text-xs text-ink-600 hover:bg-paper-50"
          >
            {copied === "password" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {form.notes && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">Notes</span>
          <p className="whitespace-pre-wrap text-sm text-ink-700">{form.notes}</p>
        </div>
      )}
    </div>
  );
}
