"use client";

import { useEffect, useState } from "react";
import type { Credential } from "@delft/types";
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryKey,
  generateVaultMasterKey,
  deriveRecoveryKeyMaterial,
  useMigrateVaultToWrappedKey,
  useVaultKey,
  wrapVaultMasterKey,
} from "@delft/shared";
import { RecoveryKeyDisplay } from "./RecoveryKeyDisplay";

interface PreparedMigration {
  vmk: CryptoKey;
  recoveryKeyString: string;
  wrappedKey: { ciphertext: string; iv: string };
  recoveryWrappedKey: { ciphertext: string; iv: string };
  reencryptedCredentials: {
    id: string;
    secretCiphertext: string;
    secretIv: string;
  }[];
}

// Runs once for any vault that has vault_salt but no vault_wrapped_key yet — i.e. it predates the
// wrapped-master-key model. `oldDirectKey` is the passphrase-derived key VaultUnlockPanel already
// verified via the legacy unlock path (that key IS what directly encrypts every existing credential
// today, so it doubles as this vault's Kp going forward — no separate re-derivation needed). This
// panel is deliberately the only thing CredentialsModal renders while migrating (see
// CredentialsModal's migrationInProgress gating) so there's no way to navigate away mid-upgrade;
// nothing is persisted until the final RPC call, so an abandoned/failed attempt always leaves the
// vault in its old, still-working state — never partially migrated.
export function VaultMigrationPanel({
  workspaceId,
  oldDirectKey,
  credentials,
  onMigrated,
}: {
  workspaceId: string;
  oldDirectKey: CryptoKey;
  credentials: Credential[];
  onMigrated: () => void;
}) {
  const vaultKey = useVaultKey(workspaceId);
  const migrate = useMigrateVaultToWrappedKey();
  const [prepared, setPrepared] = useState<PreparedMigration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      try {
        const vmk = await generateVaultMasterKey();
        const reencryptedCredentials = await Promise.all(
          credentials.map(async (c) => {
            const secret = await decryptSecret(
              oldDirectKey,
              c.secretCiphertext,
              c.secretIv,
            );
            const encrypted = await encryptSecret(vmk, secret);
            return {
              id: c.id,
              secretCiphertext: encrypted.ciphertext,
              secretIv: encrypted.iv,
            };
          }),
        );
        const recoveryKeyString = generateRecoveryKey();
        const kr = await deriveRecoveryKeyMaterial(recoveryKeyString);
        const wrappedKey = await wrapVaultMasterKey(vmk, oldDirectKey);
        const recoveryWrappedKey = await wrapVaultMasterKey(vmk, kr);
        if (cancelled) return;
        setPrepared({
          vmk,
          recoveryKeyString,
          wrappedKey,
          recoveryWrappedKey,
          reencryptedCredentials,
        });
      } catch {
        if (!cancelled) {
          setError(
            "Couldn't prepare this vault's upgrade. Close and reopen the Credentials panel to try again.",
          );
        }
      }
    }
    prepare();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run exactly once per mount, not on every credentials/oldDirectKey identity change
  }, []);

  async function handleContinue() {
    if (!prepared) return;
    setSaving(true);
    setError(null);
    try {
      await migrate.mutateAsync({
        workspaceId,
        wrappedKey: prepared.wrappedKey.ciphertext,
        wrappedKeyIv: prepared.wrappedKey.iv,
        recoveryWrappedKey: prepared.recoveryWrappedKey.ciphertext,
        recoveryWrappedKeyIv: prepared.recoveryWrappedKey.iv,
        credentialIds: credentials.map((c) => c.id),
        credentials: prepared.reencryptedCredentials,
      });
      vaultKey.setKey(prepared.vmk);
      onMigrated();
    } catch {
      setError(
        "Couldn't save this vault's upgrade — nothing was changed. This can happen if a credential was added or removed elsewhere while upgrading; try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center p-10">
        <div className="mx-auto w-full max-w-sm text-sm text-red-700">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!prepared) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-ink-400">
        Upgrading this vault…
      </div>
    );
  }

  return (
    <RecoveryKeyDisplay
      recoveryKey={prepared.recoveryKeyString}
      onContinue={handleContinue}
      continuing={saving}
    />
  );
}
