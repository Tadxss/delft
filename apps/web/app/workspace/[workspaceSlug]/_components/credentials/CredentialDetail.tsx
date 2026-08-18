"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type {
  Credential,
  CredentialFolder,
  CredentialSecret,
} from "@delft/types";
import {
  decryptSecret,
  encryptSecret,
  generatePassword,
  useCreateCredential,
  useDeleteCredential,
  useUpdateCredential,
} from "@delft/shared";

const EMPTY_SECRET: CredentialSecret = {
  username: "",
  password: "",
  notes: "",
};

interface FormState {
  folderId: string | null;
  title: string;
  url: string;
  username: string;
  password: string;
  notes: string;
}

function toFormState(
  folderId: string | null,
  title: string,
  url: string | null,
  secret: CredentialSecret,
): FormState {
  return {
    folderId,
    title,
    url: url ?? "",
    username: secret.username,
    password: secret.password,
    notes: secret.notes,
  };
}

// Flattened, depth-indented folder tree for the "Folder" <select> below — a plain native select is
// fine here since it sits inside a form full of other native inputs already, unlike a floating
// toolbar that needs a fancier searchable combobox.
function flattenFolders(
  folders: CredentialFolder[],
): { id: string; label: string }[] {
  const byParent = new Map<string | null, CredentialFolder[]>();
  for (const folder of folders) {
    const key = folder.parentFolderId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(folder);
  }
  const flattened: { id: string; label: string }[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const folder of byParent.get(parentId) ?? []) {
      flattened.push({
        id: folder.id,
        label: `${"  ".repeat(depth)}${folder.name || "Untitled"}`,
      });
      walk(folder.id, depth + 1);
    }
  }
  walk(null, 0);
  return flattened;
}

export function CredentialDetail({
  workspaceId,
  credential,
  newCredentialFolderId,
  folders,
  vaultKey,
  onSaved,
  onDeleted,
}: {
  workspaceId: string;
  credential: Credential | null; // null means "creating a new credential"
  newCredentialFolderId: string | null; // default folder for a new credential
  folders: CredentialFolder[];
  vaultKey: CryptoKey;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const isNew = credential === null;
  const createCredential = useCreateCredential();
  const updateCredential = useUpdateCredential();
  const deleteCredential = useDeleteCredential();

  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<FormState>(
    toFormState(null, "", null, EMPTY_SECRET),
  );
  const [showPassword, setShowPassword] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"username" | "password" | null>(null);

  const folderOptions = useMemo(() => flattenFolders(folders), [folders]);

  useEffect(() => {
    setDecryptError(null);
    setShowPassword(false);
    setCopied(null);

    if (isNew || !credential) {
      setEditing(true);
      setForm(toFormState(newCredentialFolderId, "", null, EMPTY_SECRET));
      return;
    }

    setEditing(false);
    let cancelled = false;
    decryptSecret(vaultKey, credential.secretCiphertext, credential.secretIv)
      .then((secret) => {
        if (!cancelled) {
          setForm(
            toFormState(
              credential.folderId,
              credential.title,
              credential.url,
              secret,
            ),
          );
        }
      })
      .catch(() => {
        if (!cancelled)
          setDecryptError("Couldn't decrypt — check your vault passphrase.");
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
        {
          workspaceId,
          folderId: form.folderId,
          title: form.title,
          url,
          secretCiphertext: ciphertext,
          secretIv: iv,
        },
        { onSuccess: (created) => onSaved(created.id) },
      );
    } else if (credential) {
      updateCredential.mutate(
        {
          id: credential.id,
          folderId: form.folderId,
          title: form.title,
          url,
          secretCiphertext: ciphertext,
          secretIv: iv,
        },
        { onSuccess: () => setEditing(false) },
      );
    }
  }

  function handleDelete() {
    if (!credential) return;
    if (!window.confirm(`Delete "${credential.title || "this credential"}"?`))
      return;
    deleteCredential.mutate(
      { id: credential.id, workspaceId },
      { onSuccess: onDeleted },
    );
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
    await navigator.clipboard.writeText(
      field === "username" ? form.username : form.password,
    );
    setCopied(field);
    setTimeout(
      () => setCopied((current) => (current === field ? null : current)),
      2000,
    );
  }

  const isSaving = createCredential.isPending || updateCredential.isPending;
  const saveError = createCredential.error ?? updateCredential.error;

  if (decryptError) {
    return <p className="p-6 text-sm text-red-700">{decryptError}</p>;
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="flex max-w-lg flex-col gap-3 p-6">
        <label
          htmlFor="title"
          className="text-xs font-medium uppercase tracking-wide text-ink-500"
        >
          Title
        </label>
        <input
          id="title"
          required
          maxLength={200}
          value={form.title}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, title: e.target.value }))
          }
          className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        />

        <label
          htmlFor="folder"
          className="text-xs font-medium uppercase tracking-wide text-ink-500"
        >
          Folder
        </label>
        <select
          id="folder"
          value={form.folderId ?? ""}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, folderId: e.target.value || null }))
          }
          className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        >
          <option value="">Root</option>
          {folderOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

        <label
          htmlFor="url"
          className="text-xs font-medium uppercase tracking-wide text-ink-500"
        >
          Website
        </label>
        <input
          id="url"
          type="url"
          maxLength={2000}
          value={form.url}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, url: e.target.value }))
          }
          placeholder="https://example.com"
          className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        />

        <label
          htmlFor="username"
          className="text-xs font-medium uppercase tracking-wide text-ink-500"
        >
          Username
        </label>
        <input
          id="username"
          value={form.username}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, username: e.target.value }))
          }
          className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
        />

        <label
          htmlFor="password"
          className="text-xs font-medium uppercase tracking-wide text-ink-500"
        >
          Password
        </label>
        <div className="flex gap-2">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={form.password}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, password: e.target.value }))
            }
            className="min-w-0 flex-1 rounded-md border border-paper-200 bg-paper-50 px-3 py-2 font-mono text-sm text-ink-800 outline-none focus:border-accent-500"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide" : "Show"}
            title={showPassword ? "Hide" : "Show"}
            className="shrink-0 rounded-md p-2 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs text-ink-500 hover:bg-paper-100 hover:text-ink-800"
          >
            <RefreshCw size={13} />
            Generate
          </button>
        </div>

        <label
          htmlFor="notes"
          className="text-xs font-medium uppercase tracking-wide text-ink-500"
        >
          Notes
        </label>
        <textarea
          id="notes"
          value={form.notes}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, notes: e.target.value }))
          }
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
        {saveError && (
          <p className="text-xs text-red-700">{saveError.message}</p>
        )}
      </form>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-2xl font-bold text-ink-800">
          {form.title || "Untitled"}
        </h2>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-paper-300 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-paper-100"
          >
            <Pencil size={13} />
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteCredential.isPending}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-400 hover:bg-paper-100 hover:text-red-700"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      </div>

      {credential?.url && (
        <a
          href={credential.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1 truncate text-sm text-accent-500 underline"
        >
          <span className="min-w-0 truncate">{credential.url}</span>
          <ExternalLink size={12} className="shrink-0" />
        </a>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Username
        </span>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
            {form.username || "—"}
          </span>
          <button
            type="button"
            onClick={() => handleCopy("username")}
            aria-label="Copy username"
            title="Copy username"
            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-paper-100 ${
              copied === "username"
                ? "text-accent-500"
                : "text-ink-500 hover:text-ink-800"
            }`}
          >
            {copied === "username" ? <Check size={13} /> : <Copy size={13} />}
            {copied === "username" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Password
        </span>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink-800">
            {showPassword
              ? form.password || "—"
              : "•".repeat(Math.max(form.password.length, 8))}
          </span>
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide" : "Show"}
            title={showPassword ? "Hide" : "Show"}
            className="shrink-0 rounded-md p-1.5 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
          >
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            type="button"
            onClick={() => handleCopy("password")}
            aria-label="Copy password"
            title="Copy password"
            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-paper-100 ${
              copied === "password"
                ? "text-accent-500"
                : "text-ink-500 hover:text-ink-800"
            }`}
          >
            {copied === "password" ? <Check size={13} /> : <Copy size={13} />}
            {copied === "password" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {form.notes && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Notes
          </span>
          <p className="whitespace-pre-wrap text-sm text-ink-700">
            {form.notes}
          </p>
        </div>
      )}
    </div>
  );
}
