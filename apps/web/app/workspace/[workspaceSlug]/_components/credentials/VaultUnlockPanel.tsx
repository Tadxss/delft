"use client";

import { useEffect, useState } from "react";
import type { Credential, Workspace } from "@crowscribe/types";
import {
  decryptSecret,
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
import { VaultMigrationPanel } from "./VaultMigrationPanel";

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
  | { kind: "legacyMigration"; oldDirectKey: CryptoKey }
  | { kind: "forgot" };

// Four things this panel can show, depending on the workspace's vault state and what the user just
// did:
// - `vaultWrappedKey` set (the normal case for any vault created after the wrapped-key model
//   shipped, or a legacy vault that's completed its one-time migration): passphrase → derive Kp →
//   unwrap the Vault Master Key. Unwrap failure IS "wrong passphrase" (an AES-GCM auth-tag check),
//   same failure semantics every check in this vault uses.
// - `vaultSalt` set but no `vaultWrappedKey` (a legacy vault): verify the passphrase by
//   test-decrypting a real credential (or, for an empty legacy vault with nothing to test-decrypt,
//   proceed unverified — there's nothing to check against), then hand off into VaultMigrationPanel
//   to re-encrypt everything under a new VMK and (mandatorily) generate this vault's first recovery
//   key.
// - `vaultSalt` null: first-time setup — generate salt + VMK + recovery key, wrap the VMK under
//   both, and require the user to confirm they've saved the recovery key (RecoveryKeyDisplay)
//   before any of it is persisted.
// - "Forgot passphrase?" (only shown once a wrapped key exists): ForgotPassphrasePanel recovers via
//   the saved recovery key and lets the user set a new passphrase, with zero data loss.
export function VaultUnlockPanel({
  workspace,
  credentials,
  onBusyChange,
}: {
  workspace: Workspace;
  credentials: Credential[] | undefined;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { id: workspaceId, vaultSalt, vaultWrappedKey, vaultWrappedKeyIv } =
    workspace;
  const vaultKey = useVaultKey(workspaceId);
  const setVaultWrappedKey = useSetVaultWrappedKey();
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persistingSetup, setPersistingSetup] = useState(false);

  const isSetup = !vaultSalt;
  const hasWrappedKey = Boolean(vaultWrappedKey && vaultWrappedKeyIv);
  const credentialsLoading =
    !isSetup && !hasWrappedKey && credentials === undefined;

  // Unsaved recovery-key material exists in memory during these two phases — block the modal from
  // being closed out from under them (see CredentialsModal's onBusyChange usage). The cleanup is
  // required, not just tidy: once setup/migration succeeds, this whole component unmounts (the
  // vault is now unlocked, so CredentialsModal swaps to rendering the credential list instead) —
  // without it, onBusyChange(false) would never fire and the modal's close button would stay
  // disabled forever.
  useEffect(() => {
    onBusyChange?.(
      phase.kind === "setupRecoveryKey" || phase.kind === "legacyMigration",
    );
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

      const kp = await deriveVaultKey(passphrase, vaultSalt);

      if (hasWrappedKey && vaultWrappedKey && vaultWrappedKeyIv) {
        try {
          const vmk = await unwrapVaultMasterKey(
            vaultWrappedKey,
            vaultWrappedKeyIv,
            kp,
          );
          vaultKey.setKey(vmk);
        } catch {
          setError("Wrong passphrase — please try again.");
          setPassphrase("");
        }
        return;
      }

      // Legacy vault (no wrapped key yet) — authenticate by test-decrypting a real credential,
      // then hand off to VaultMigrationPanel rather than unlocking directly.
      const testCredential = credentials?.[0];
      if (testCredential) {
        try {
          await decryptSecret(
            kp,
            testCredential.secretCiphertext,
            testCredential.secretIv,
          );
        } catch {
          setError("Wrong passphrase — please try again.");
          setPassphrase("");
          return;
        }
      }
      // Either verified via a credential, or nothing anywhere to verify against yet (an empty,
      // never-migrated vault) — proceed straight to migration either way.
      setPhase({ kind: "legacyMigration", oldDirectKey: kp });
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

  if (phase.kind === "legacyMigration") {
    return (
      <VaultMigrationPanel
        workspaceId={workspaceId}
        oldDirectKey={phase.oldDirectKey}
        credentials={credentials ?? []}
        onMigrated={() => setPhase({ kind: "form" })}
      />
    );
  }

  if (phase.kind === "forgot") {
    return (
      <ForgotPassphrasePanel
        workspace={workspace}
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
          <Button
            type="submit"
            disabled={unlocking || credentialsLoading}
            className="mt-1"
          >
            {unlocking
              ? "Unlocking…"
              : credentialsLoading
                ? "Loading…"
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
        {!isSetup && hasWrappedKey && (
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
