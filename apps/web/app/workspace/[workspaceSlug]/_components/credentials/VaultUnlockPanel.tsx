"use client";

import { useState } from "react";
import { generateSalt, useSetVaultSalt, useVaultKey } from "@delft/shared";

const MIN_PASSPHRASE_LENGTH = 8;

// Two modes depending on whether this workspace has ever had a vault passphrase set:
// - `vaultSalt` is null: first-time setup — generate a salt, store it, derive+hold the key.
// - `vaultSalt` is set: prompt for the existing passphrase — there's no way to verify it's
//   correct until something is actually decrypted (see vaultCrypto.ts), so this just derives and
//   holds whatever key results; a wrong passphrase surfaces later as a decrypt failure.
export function VaultUnlockPanel({
  workspaceId,
  vaultSalt,
}: {
  workspaceId: string;
  vaultSalt: string | null;
}) {
  const vaultKey = useVaultKey(workspaceId);
  const setVaultSalt = useSetVaultSalt();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSetup = !vaultSalt;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isSetup && passphrase !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setUnlocking(true);
    try {
      if (isSetup) {
        const saltB64 = generateSalt();
        await setVaultSalt.mutateAsync({ workspaceId, saltB64 });
        await vaultKey.unlock(passphrase, saltB64);
      } else {
        await vaultKey.unlock(passphrase, vaultSalt);
      }
    } catch {
      setError("Couldn't unlock the vault. Try again.");
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-lg border border-paper-200 bg-paper-100 p-6 shadow-sm">
        <h2 className="text-sm font-medium text-ink-800">
          {isSetup ? "Set up this workspace's vault" : "Unlock vault"}
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          {isSetup
            ? "This passphrase is separate from your login and is never sent to the server — only you can decrypt what you store here. There's no way to recover it if you forget it."
            : "Enter your vault passphrase to view and manage this workspace's credentials."}
        </p>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <label htmlFor="passphrase" className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Vault passphrase
          </label>
          <input
            id="passphrase"
            type="password"
            required
            minLength={isSetup ? MIN_PASSPHRASE_LENGTH : undefined}
            autoComplete="off"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
          />
          {isSetup && (
            <>
              <label htmlFor="confirm" className="text-xs font-medium uppercase tracking-wide text-ink-500">
                Confirm passphrase
              </label>
              <input
                id="confirm"
                type="password"
                required
                minLength={MIN_PASSPHRASE_LENGTH}
                autoComplete="off"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
              />
            </>
          )}
          <button
            type="submit"
            disabled={unlocking}
            className="mt-1 rounded-md bg-ink-800 px-3 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
          >
            {unlocking ? "Unlocking…" : isSetup ? "Create vault" : "Unlock"}
          </button>
          {mismatch && <p className="text-xs text-red-700">Passphrases don&apos;t match.</p>}
          {error && <p className="text-xs text-red-700">{error}</p>}
        </form>
      </div>
    </div>
  );
}
