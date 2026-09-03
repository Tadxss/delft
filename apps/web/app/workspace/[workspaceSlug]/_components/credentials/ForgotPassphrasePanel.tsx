"use client";

import { useState } from "react";
import Link from "next/link";
import type { WorkspaceVault } from "@crowscribe/types";
import { Button } from "../../../../_components/Button";
import { Input } from "../../../../_components/Input";
import {
  deriveRecoveryKeyMaterial,
  deriveVaultKey,
  generateSalt,
  unwrapVaultMasterKey,
  useRotateVaultPassphrase,
  useVaultKey,
  wrapVaultMasterKey,
} from "@crowscribe/shared";

const MIN_PASSPHRASE_LENGTH = 8;

// Reached from VaultUnlockPanel's "Forgot passphrase?" link. Two steps: prove you hold the
// recovery key (by successfully unwrapping the VMK with it — the same auth-tag-failure check every
// other unlock path in this vault uses), then pick a new passphrase and re-wrap the *same* VMK
// under it. No data loss, and no server/email involvement at any point — the recovery key itself
// is the second factor, entirely client-side. Only salt/wrappedKey(_iv) are rewritten;
// recoveryWrappedKey(_iv) is untouched, so the same recovery key keeps working afterward.
export function ForgotPassphrasePanel({
  workspaceId,
  vault,
  onRecovered,
  onCancel,
}: {
  workspaceId: string;
  vault: WorkspaceVault;
  onRecovered: () => void;
  onCancel: () => void;
}) {
  const vaultKey = useVaultKey(workspaceId);
  const rotatePassphrase = useRotateVaultPassphrase();
  const [recoveryKeyInput, setRecoveryKeyInput] = useState("");
  const [vmk, setVmk] = useState<CryptoKey | null>(null);
  const [newPassphrase, setNewPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRecoveryKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const kr = await deriveRecoveryKeyMaterial(recoveryKeyInput);
      // extractable: true — this recovered VMK is about to be re-wrapped under a new
      // passphrase-derived key below, which needs exportKey; see unwrapVaultMasterKey's comment.
      const recoveredVmk = await unwrapVaultMasterKey(
        vault.recoveryWrappedKey,
        vault.recoveryWrappedKeyIv,
        kr,
        true,
      );
      setVmk(recoveredVmk);
    } catch {
      setError("That recovery key doesn't match — check for typos.");
      setRecoveryKeyInput("");
    } finally {
      setBusy(false);
    }
  }

  async function handleNewPassphraseSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vmk) return;
    if (newPassphrase !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setError(null);
    setBusy(true);
    try {
      const saltB64 = generateSalt();
      const kp = await deriveVaultKey(newPassphrase, saltB64);
      const wrapped = await wrapVaultMasterKey(vmk, kp);
      await rotatePassphrase.mutateAsync({
        workspaceId,
        saltB64,
        wrappedKey: wrapped.ciphertext,
        wrappedKeyIv: wrapped.iv,
      });
      vaultKey.setKey(vmk);
      onRecovered();
    } catch {
      setError("Couldn't set the new passphrase. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (vmk) {
    return (
      <div className="flex flex-1 items-center p-10">
        <div className="mx-auto w-full max-w-sm">
          <h2 className="text-sm font-medium text-ink-800">
            Choose a new passphrase
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            Your recovery key checked out — every credential in this vault stays
            exactly as it is.
          </p>
          <form
            onSubmit={handleNewPassphraseSubmit}
            className="mt-4 flex flex-col gap-3"
          >
            <Input
              type="password"
              required
              minLength={MIN_PASSPHRASE_LENGTH}
              autoComplete="off"
              placeholder="New vault passphrase"
              value={newPassphrase}
              onChange={(e) => setNewPassphrase(e.target.value)}
            />
            <Input
              type="password"
              required
              minLength={MIN_PASSPHRASE_LENGTH}
              autoComplete="off"
              placeholder="Confirm new passphrase"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button type="submit" disabled={busy} className="mt-1">
              {busy ? "Saving…" : "Set new passphrase"}
            </Button>
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

  return (
    <div className="flex flex-1 items-center p-10">
      <div className="mx-auto w-full max-w-sm">
        <h2 className="text-sm font-medium text-ink-800">
          Recover with your recovery key
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Enter the recovery key you saved when this vault was set up.
        </p>
        <form
          onSubmit={handleRecoveryKeySubmit}
          className="mt-4 flex flex-col gap-3"
        >
          <Input
            type="text"
            required
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="XXXXX-XXXXX-XXXXX-…"
            value={recoveryKeyInput}
            onChange={(e) => setRecoveryKeyInput(e.target.value)}
            className="font-mono"
          />
          <Button type="submit" disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </Button>
          {error && (
            <div className="text-xs text-red-700">
              <p>{error}</p>
              <Link
                href={`/workspace/${workspaceId}/vault-reset`}
                className="mt-1 inline-block underline"
              >
                Lost your recovery key too?
              </Link>
            </div>
          )}
        </form>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 text-xs font-medium text-ink-500 hover:text-ink-800"
        >
          Back to unlock
        </button>
      </div>
    </div>
  );
}
