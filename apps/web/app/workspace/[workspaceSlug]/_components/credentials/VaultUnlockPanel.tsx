"use client";

import { useState } from "react";
import type { Credential } from "@delft/types";
import {
  decryptSecret,
  deriveVaultKey,
  encryptVerifier,
  generateSalt,
  useSetVaultSalt,
  useSetVaultVerifier,
  useVaultKey,
  verifyVaultKey,
} from "@delft/shared";

const MIN_PASSPHRASE_LENGTH = 8;

// Two modes depending on whether this workspace has ever had a vault passphrase set:
// - `vaultSalt` is null: first-time setup — generate a salt, derive the key, and save an encrypted
//   verifier (vaultCrypto.ts's encryptVerifier()) alongside the salt, so this vault can have its
//   passphrase verified from the very first unlock, even before it has a single credential.
// - `vaultSalt` is set: prompt for the existing passphrase. PBKDF2 itself can't fail on a wrong
//   passphrase (see vaultCrypto.ts) — it just deterministically derives a *different* key — so
//   correctness has to be actively verified before ever granting access:
//     1. `vaultVerifier` present (the normal case for any vault created after this existed, or a
//        legacy vault that's already been backfilled) — test-decrypt it directly.
//     2. No verifier yet, but the vault has a credential — fall back to test-decrypting that
//        instead (the original mechanism), and opportunistically backfill the verifier on success
//        so every unlock from here on uses path 1 instead.
//     3. No verifier and no credentials — a legacy vault, never yet unlocked since this shipped,
//        with nothing added to it. Nothing anywhere to verify a passphrase against (the server
//        never sees it, by design) — proceeds on trust exactly once, same bootstrap assumption as
//        setup, and immediately backfills the verifier so it's never trust-only again.
export function VaultUnlockPanel({
  workspaceId,
  vaultSalt,
  vaultVerifier,
  vaultVerifierIv,
  credentials,
}: {
  workspaceId: string;
  vaultSalt: string | null;
  vaultVerifier: string | null;
  vaultVerifierIv: string | null;
  credentials: Credential[] | undefined;
}) {
  const vaultKey = useVaultKey(workspaceId);
  const setVaultSalt = useSetVaultSalt();
  const setVaultVerifier = useSetVaultVerifier();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSetup = !vaultSalt;
  const hasVerifier = Boolean(vaultVerifier && vaultVerifierIv);
  const credentialsLoading =
    !isSetup && !hasVerifier && credentials === undefined;

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
        const key = await deriveVaultKey(passphrase, saltB64);
        const verifier = await encryptVerifier(key);
        await setVaultSalt.mutateAsync({
          workspaceId,
          saltB64,
          verifierCiphertext: verifier.ciphertext,
          verifierIv: verifier.iv,
        });
        vaultKey.setKey(key);
        return;
      }

      const key = await deriveVaultKey(passphrase, vaultSalt);

      if (vaultVerifier && vaultVerifierIv) {
        try {
          await verifyVaultKey(key, vaultVerifier, vaultVerifierIv);
        } catch {
          setError("Wrong passphrase — please try again.");
          setPassphrase("");
          return;
        }
        vaultKey.setKey(key);
        return;
      }

      // Legacy vault with no verifier yet — fall back to test-decrypting an existing credential.
      const testCredential = credentials?.[0];
      if (testCredential) {
        try {
          await decryptSecret(
            key,
            testCredential.secretCiphertext,
            testCredential.secretIv,
          );
        } catch {
          setError("Wrong passphrase — please try again.");
          setPassphrase("");
          return;
        }
      }
      // Either verified via a credential, or nothing anywhere to verify against yet — proceed.
      vaultKey.setKey(key);
      // Best-effort backfill (fire-and-forget, not awaited): may silently fail for a non-owner
      // member per workspaces_update_owner — harmless, it just tries again on the owner's next
      // unlock instead.
      const verifier = await encryptVerifier(key);
      setVaultVerifier.mutate({
        workspaceId,
        verifierCiphertext: verifier.ciphertext,
        verifierIv: verifier.iv,
      });
    } catch {
      setError("Couldn't unlock the vault. Try again.");
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div className="flex flex-1 items-center p-10">
      <div className="mx-auto w-full max-w-sm">
        <h2 className="text-sm font-medium text-ink-800">
          {isSetup ? "Set up this workspace's vault" : "Unlock vault"}
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          {isSetup
            ? "This passphrase is separate from your login and is never sent to the server — only you can decrypt what you store here. There's no way to recover it if you forget it."
            : "Enter your vault passphrase to view and manage this workspace's credentials."}
        </p>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <label
            htmlFor="passphrase"
            className="text-xs font-medium uppercase tracking-wide text-ink-500"
          >
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
              <label
                htmlFor="confirm"
                className="text-xs font-medium uppercase tracking-wide text-ink-500"
              >
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
            disabled={unlocking || credentialsLoading}
            className="mt-1 rounded-md bg-ink-800 px-3 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
          >
            {unlocking
              ? "Unlocking…"
              : credentialsLoading
                ? "Loading…"
                : isSetup
                  ? "Create vault"
                  : "Unlock"}
          </button>
          {mismatch && (
            <p className="text-xs text-red-700">
              Passphrases don&apos;t match.
            </p>
          )}
          {error && <p className="text-xs text-red-700">{error}</p>}
        </form>
      </div>
    </div>
  );
}
