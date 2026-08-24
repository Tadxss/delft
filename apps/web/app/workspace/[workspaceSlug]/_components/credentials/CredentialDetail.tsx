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
  CredentialType,
} from "@crowscribe/types";
import {
  decryptSecret,
  encryptSecret,
  generatePassword,
  useCreateCredential,
  useDeleteCredential,
  useUpdateCredential,
} from "@crowscribe/shared";
import { Button } from "../../../../_components/Button";
import { FormLabel } from "../../../../_components/FormLabel";
import { Heading } from "../../../../_components/Heading";
import { Input, Select, Textarea } from "../../../../_components/Input";
import { CREDENTIAL_TYPE_OPTIONS } from "./credentialTypeOptions";

const EMPTY_SECRET: CredentialSecret = { notes: "" };

interface FormState {
  folderId: string | null;
  title: string;
  url: string;
  type: CredentialType;
  username: string;
  password: string;
  apiKey: string;
  pin: string;
  notes: string;
}

function toFormState(
  folderId: string | null,
  title: string,
  url: string | null,
  type: CredentialType,
  secret: CredentialSecret,
): FormState {
  return {
    folderId,
    title,
    url: url ?? "",
    type,
    username: secret.username ?? "",
    password: secret.password ?? "",
    apiKey: secret.apiKey ?? "",
    pin: secret.pin ?? "",
    notes: secret.notes,
  };
}

// Only the fields relevant to `type` are ever encrypted — switching a credential's type and
// re-saving doesn't carry a stale password/apiKey/pin from a previous type into the new ciphertext.
function buildSecret(type: CredentialType, form: FormState): CredentialSecret {
  switch (type) {
    case "login":
      return { username: form.username, password: form.password, notes: form.notes };
    case "oauth":
      return { username: form.username, notes: form.notes };
    case "api_key":
      return { apiKey: form.apiKey, notes: form.notes };
    case "pin":
      return { pin: form.pin, notes: form.notes };
  }
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
    toFormState(null, "", null, "login", EMPTY_SECRET),
  );
  const [showSecret, setShowSecret] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [copied, setCopied] = useState<
    "username" | "password" | "apiKey" | "pin" | null
  >(null);

  const folderOptions = useMemo(() => flattenFolders(folders), [folders]);

  useEffect(() => {
    setDecryptError(null);
    setShowSecret(false);
    setCopied(null);

    if (isNew || !credential) {
      setEditing(true);
      setForm(
        toFormState(newCredentialFolderId, "", null, "login", EMPTY_SECRET),
      );
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
              credential.type,
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
    const secret = buildSecret(form.type, form);
    const { ciphertext, iv } = await encryptSecret(vaultKey, secret);
    const url = form.url.trim() || null;

    if (isNew) {
      createCredential.mutate(
        {
          workspaceId,
          folderId: form.folderId,
          title: form.title,
          url,
          type: form.type,
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
          type: form.type,
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

  function handleGeneratePassword() {
    const password = generatePassword({
      length: 20,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: true,
    });
    setForm((prev) => ({ ...prev, password }));
    setShowSecret(true);
  }

  function handleGeneratePin() {
    const pin = generatePassword({
      length: 6,
      uppercase: false,
      lowercase: false,
      digits: true,
      symbols: false,
    });
    setForm((prev) => ({ ...prev, pin }));
    setShowSecret(true);
  }

  const copyValues: Record<"username" | "password" | "apiKey" | "pin", string> = {
    username: form.username,
    password: form.password,
    apiKey: form.apiKey,
    pin: form.pin,
  };

  async function handleCopy(field: "username" | "password" | "apiKey" | "pin") {
    await navigator.clipboard.writeText(copyValues[field]);
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
        <FormLabel htmlFor="title">Title</FormLabel>
        <Input
          id="title"
          required
          maxLength={200}
          value={form.title}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, title: e.target.value }))
          }
        />

        <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Type
        </span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
          {CREDENTIAL_TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = form.type === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  setForm((prev) => ({ ...prev, type: option.value }))
                }
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                  active
                    ? "border-accent-500 bg-accent-500 text-white"
                    : "border-paper-200 text-ink-600 hover:bg-paper-100"
                }`}
              >
                <Icon size={14} />
                {option.label}
              </button>
            );
          })}
        </div>

        <FormLabel htmlFor="folder">Folder</FormLabel>
        <Select
          id="folder"
          value={form.folderId ?? ""}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, folderId: e.target.value || null }))
          }
        >
          <option value="">Root</option>
          {folderOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>

        <FormLabel htmlFor="url">Website</FormLabel>
        <Input
          id="url"
          type="url"
          maxLength={2000}
          value={form.url}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, url: e.target.value }))
          }
          placeholder="https://example.com"
        />

        {form.type === "login" && (
          <>
            <FormLabel htmlFor="username">Username</FormLabel>
            <Input
              id="username"
              value={form.username}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, username: e.target.value }))
              }
            />

            <FormLabel htmlFor="password">Password</FormLabel>
            <div className="flex gap-2">
              <Input
                id="password"
                type={showSecret ? "text" : "password"}
                autoComplete="off"
                value={form.password}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, password: e.target.value }))
                }
                className="min-w-0 flex-1 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? "Hide" : "Show"}
                title={showSecret ? "Hide" : "Show"}
                className="shrink-0 rounded-md p-1.5 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs text-ink-500 hover:bg-paper-100 hover:text-ink-800"
              >
                <RefreshCw size={13} />
                Generate
              </button>
            </div>
          </>
        )}

        {form.type === "oauth" && (
          <>
            <FormLabel htmlFor="username">Account / Email</FormLabel>
            <Input
              id="username"
              value={form.username}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, username: e.target.value }))
              }
            />
            <p className="text-xs text-ink-400">
              No password stored — sign-in happens through the provider
              (e.g. Google).
            </p>
          </>
        )}

        {form.type === "api_key" && (
          <>
            <FormLabel htmlFor="apiKey">API Key</FormLabel>
            <div className="flex gap-2">
              <Input
                id="apiKey"
                type={showSecret ? "text" : "password"}
                autoComplete="off"
                value={form.apiKey}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, apiKey: e.target.value }))
                }
                className="min-w-0 flex-1 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? "Hide" : "Show"}
                title={showSecret ? "Hide" : "Show"}
                className="shrink-0 rounded-md p-1.5 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </>
        )}

        {form.type === "pin" && (
          <>
            <FormLabel htmlFor="pin">PIN</FormLabel>
            <div className="flex gap-2">
              <Input
                id="pin"
                type={showSecret ? "text" : "password"}
                inputMode="numeric"
                autoComplete="off"
                value={form.pin}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, pin: e.target.value }))
                }
                className="min-w-0 flex-1 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? "Hide" : "Show"}
                title={showSecret ? "Hide" : "Show"}
                className="shrink-0 rounded-md p-1.5 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                type="button"
                onClick={handleGeneratePin}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs text-ink-500 hover:bg-paper-100 hover:text-ink-800"
              >
                <RefreshCw size={13} />
                Generate
              </button>
            </div>
          </>
        )}

        <FormLabel htmlFor="notes">Notes</FormLabel>
        <Textarea
          id="notes"
          value={form.notes}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, notes: e.target.value }))
          }
          rows={4}
          className="resize-y"
        />

        <div className="mt-2 flex items-center gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
          {!isNew && (
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
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
        <Heading level="content-compact" as="h2">
          {form.title || "Untitled"}
        </Heading>
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

      {(form.type === "login" || form.type === "oauth") && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {form.type === "oauth" ? "Account / Email" : "Username"}
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
      )}

      {form.type === "login" && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Password
          </span>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink-800">
              {showSecret
                ? form.password || "—"
                : "•".repeat(Math.max(form.password.length, 8))}
            </span>
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              aria-label={showSecret ? "Hide" : "Show"}
              title={showSecret ? "Hide" : "Show"}
              className="shrink-0 rounded-md p-1.5 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
            >
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
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
      )}

      {(form.type === "api_key" || form.type === "pin") && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {form.type === "api_key" ? "API Key" : "PIN"}
          </span>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink-800">
              {(() => {
                const value = form.type === "api_key" ? form.apiKey : form.pin;
                return showSecret
                  ? value || "—"
                  : "•".repeat(Math.max(value.length, 8));
              })()}
            </span>
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              aria-label={showSecret ? "Hide" : "Show"}
              title={showSecret ? "Hide" : "Show"}
              className="shrink-0 rounded-md p-1.5 text-ink-500 hover:bg-paper-100 hover:text-ink-800"
            >
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              type="button"
              onClick={() => handleCopy(form.type === "api_key" ? "apiKey" : "pin")}
              aria-label={`Copy ${form.type === "api_key" ? "API key" : "PIN"}`}
              title={`Copy ${form.type === "api_key" ? "API key" : "PIN"}`}
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-paper-100 ${
                copied === (form.type === "api_key" ? "apiKey" : "pin")
                  ? "text-accent-500"
                  : "text-ink-500 hover:text-ink-800"
              }`}
            >
              {copied === (form.type === "api_key" ? "apiKey" : "pin") ? (
                <Check size={13} />
              ) : (
                <Copy size={13} />
              )}
              {copied === (form.type === "api_key" ? "apiKey" : "pin")
                ? "Copied"
                : "Copy"}
            </button>
          </div>
        </div>
      )}

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
