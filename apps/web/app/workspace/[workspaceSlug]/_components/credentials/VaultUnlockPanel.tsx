"use client";

import { useEffect, useState } from "react";
import type { WorkspaceVault } from "@crowscribe/types";
import {
  deriveVaultKey,
  generateRecoveryKey,
  generateSalt,
  generateVaultMasterKey,
  deriveRecoveryKeyMaterial,
  unwrapVaultMasterKey,
  useSetVaultWrappedKey,
  useVaultKey,
  wrapVaultMasterKey,
} from "@crowscribe/shared";
import { Button } from "../../../../_components/Button";
import { FormLabel } from "../../../../_components/FormLabel";
import { Input } from "../../../../_components/Input";
import { ForgotPassphrasePanel } from "./ForgotPassphrasePanel";
import { RecoveryKeyDisplay } from "./RecoveryKeyDisplay";

const MIN_PASSPHRASE_LENGTH = 8;

interface PreparedSetup {
  saltB64: string;
  vmk: CryptoKey;
  recoveryKeyString: string;
  wrappedKey: { ciphertext: string; iv: string };
  recoveryWrappedKey: { ciphertext: string; iv: string };
}

type Phase =
  | { kind: "form" }
  | { kind: "setupRecoveryKey"; setup: PreparedSetup }
  | { kind: "forgot" };

// Three things this panel can show, depending on whether the caller has a vault row for this
// workspace (useMyWorkspaceVault) and what they just did:
// - no vault row: first-time setup — generate salt + VMK + recovery key, wrap the VMK under both
//   the passphrase-derived key and the recovery key, and require the user to confirm they've
//   saved the recovery key (RecoveryKeyDisplay) before any of it is persisted.
// - vault row present: passphrase → derive Kp → unwrap the Vault Master Key. Unwrap failure IS
//   "wrong passphrase" (an AES-GCM auth-tag check), the same failure semantics every check in
//   this vault uses.
// - "Forgot passphrase?": ForgotPassphrasePanel recovers via the saved recovery key and lets the
//   user set a new passphrase, with zero data loss.
//
// (The legacy pre-wrapped-key path is gone as of Build Order step 92 — every vault row always has
// wrapped-key columns.)
export function VaultUnlockPanel({
  workspaceId,
  vault,
  onBusyChange,
}: {
  workspaceId: string;
  vault: WorkspaceVault | null;
  onBusyChange?: (busy: boolean) => void;
}) {
  const vaultKey = useVaultKey(workspaceId);
  const setVaultWrappedKey = useSetVaultWrappedKey();
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persistingSetup, setPersistingSetup] = useState(false);

  const isSetup = !vault;

  // Unsaved recovery-key material exists in memory during the setup-recovery-key phase — block the
  // modal from being closed out from under it (see CredentialsModal's onBusyChange usage). The
  // cleanup is required, not just tidy: once setup succeeds this whole component unmounts (the
  // vault is now unlocked, so CredentialsModal swaps to rendering the credential list) — without
  // it, onBusyChange(false) would never fire and the modal's close button would stay disabled.
  useEffect(() => {
    onBusyChange?.(phase.kind === "setupRecoveryKey");
    return () => onBusyChange?.(false);
  }, [phase.kind, onBusyChange]);

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
        const kp = await deriveVaultKey(passphrase, saltB64);
        const vmk = await generateVaultMasterKey();
        const recoveryKeyString = generateRecoveryKey();
        const kr = await deriveRecoveryKeyMaterial(recoveryKeyString);
        const wrappedKey = await wrapVaultMasterKey(vmk, kp);
        const recoveryWrappedKey = await wrapVaultMasterKey(vmk, kr);
        setPhase({
          kind: "setupRecoveryKey",
          setup: {
            saltB64,
            vmk,
            recoveryKeyString,
            wrappedKey,
            recoveryWrappedKey,
          },
        });
        return;
      }

      const kp = await deriveVaultKey(passphrase, vault.salt);
      try {
        const vmk = await unwrapVaultMasterKey(
          vault.wrappedKey,
          vault.wrappedKeyIv,
          kp,
        );
        vaultKey.setKey(vmk);
      } catch {
        setError("Wrong passphrase — please try again.");
        setPassphrase("");
      }
    } catch {
      setError("Couldn't unlock the vault. Try again.");
    } finally {
      setUnlocking(false);
    }
  }

  async function handleSetupContinue() {
    if (phase.kind !== "setupRecoveryKey") return;
    const { setup } = phase;
    setPersistingSetup(true);
    try {
      await setVaultWrappedKey.mutateAsync({
        workspaceId,
        saltB64: setup.saltB64,
        wrappedKey: setup.wrappedKey.ciphertext,
        wrappedKeyIv: setup.wrappedKey.iv,
        recoveryWrappedKey: setup.recoveryWrappedKey.ciphertext,
        recoveryWrappedKeyIv: setup.recoveryWrappedKey.iv,
      });
      vaultKey.setKey(setup.vmk);
    } finally {
      setPersistingSetup(false);
    }
  }

  if (phase.kind === "setupRecoveryKey") {
    return (
      <RecoveryKeyDisplay
        recoveryKey={phase.setup.recoveryKeyString}
        onContinue={handleSetupContinue}
        continuing={persistingSetup}
      />
    );
  }

  if (phase.kind === "forgot" && vault) {
    return (
      <ForgotPassphrasePanel
        workspaceId={workspaceId}
        vault={vault}
        onRecovered={() => setPhase({ kind: "form" })}
        onCancel={() => setPhase({ kind: "form" })}
      />
    );
  }

  return (
    <div className="flex flex-1 items-center p-10">
      <div className="mx-auto w-full max-w-sm">
        <h2 className="text-sm font-medium text-ink-800">
          {isSetup ? "Set up this workspace's vault" : "Unlock vault"}
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          {isSetup
            ? "This passphrase is separate from your login and is never sent to the server — only you can decrypt what you store here. You'll get a recovery key next in case you ever forget it."
            : "Enter your vault passphrase to view and manage this workspace's credentials."}
        </p>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <FormLabel htmlFor="passphrase">Vault passphrase</FormLabel>
          <Input
            id="passphrase"
            type="password"
            required
            minLength={isSetup ? MIN_PASSPHRASE_LENGTH : undefined}
            autoComplete="off"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          {isSetup && (
            <>
              <FormLabel htmlFor="confirm">Confirm passphrase</FormLabel>
              <Input
                id="confirm"
                type="password"
                required
                minLength={MIN_PASSPHRASE_LENGTH}
                autoComplete="off"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </>
          )}
          <Button type="submit" disabled={unlocking} className="mt-1">
            {unlocking
              ? "Unlocking…"
              : isSetup
                ? "Create vault"
                : "Unlock"}
          </Button>
          {mismatch && (
            <p className="text-xs text-red-700">
              Passphrases don&apos;t match.
            </p>
          )}
          {error && <p className="text-xs text-red-700">{error}</p>}
        </form>
        {!isSetup && (
          <button
            type="button"
            onClick={() => setPhase({ kind: "forgot" })}
            className="mt-3 text-xs font-medium text-ink-500 hover:text-ink-800"
          >
            Forgot passphrase?
          </button>
        )}
      </div>
    </div>
  );
}
