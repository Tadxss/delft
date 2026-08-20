"use client";

// TEMPORARY diagnostic — delete this whole directory once it's been used to confirm/fix the
// Instamo unlock bug. Tests whether a typed passphrase actually decrypts the workspace's real
// credential rows, independent of the (possibly stale) vault_verifier check VaultUnlockPanel uses.
// The passphrase is only ever handed to deriveVaultKey in memory — never passed to any hook,
// mutation, or network call. Only a pass/fail count + failing ids are rendered, never plaintext.

import { useParams } from "next/navigation";
import { useState } from "react";
import { decryptSecret, deriveVaultKey, parseWorkspaceSlug, useCredentials, useWorkspace } from "@delft/shared";

export default function VaultDiagnosticPage() {
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceId = parseWorkspaceSlug(params.workspaceSlug);
  const { data: workspace } = useWorkspace(workspaceId);
  const { data: credentials } = useCredentials(workspaceId);
  const [passphrase, setPassphrase] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{
    passed: string[];
    failed: string[];
  } | null>(null);

  async function runCheck(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace?.vaultSalt || !credentials) return;
    setChecking(true);
    setResult(null);
    try {
      const key = await deriveVaultKey(passphrase, workspace.vaultSalt);
      const passed: string[] = [];
      const failed: string[] = [];
      for (const c of credentials) {
        try {
          await decryptSecret(key, c.secretCiphertext, c.secretIv);
          passed.push(c.id);
        } catch {
          failed.push(c.id);
        }
      }
      setResult({ passed, failed });
    } finally {
      setChecking(false);
      setPassphrase("");
    }
  }

  return (
    <main className="mx-auto max-w-lg p-8 text-sm text-ink-800">
      <h1 className="text-base font-semibold">Vault diagnostic (temporary)</h1>
      <p className="mt-2 text-ink-500">
        Workspace: {workspace?.name ?? "loading…"} ({credentials?.length ?? "…"}{" "}
        credential rows)
      </p>
      <form onSubmit={runCheck} className="mt-4 flex flex-col gap-3">
        <input
          type="password"
          autoComplete="off"
          required
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="Vault passphrase to test"
          className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 outline-none focus:border-accent-500"
        />
        <button
          type="submit"
          disabled={checking || !workspace?.vaultSalt || !credentials}
          className="rounded-md bg-ink-800 px-3 py-2 font-medium text-paper-50 disabled:opacity-60"
        >
          {checking ? "Checking…" : "Test-decrypt every credential"}
        </button>
      </form>
      {result && (
        <div className="mt-4 rounded-md border border-paper-200 p-3">
          <p>
            {result.passed.length} passed, {result.failed.length} failed
          </p>
          {result.failed.length > 0 && (
            <p className="mt-1 text-xs text-ink-500">
              Failed ids: {result.failed.join(", ")}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
