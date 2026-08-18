"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { deriveVaultKey } from "../lib/vaultCrypto";

interface VaultKeyContextValue {
  isUnlocked: (workspaceId: string) => boolean;
  getKey: (workspaceId: string) => CryptoKey | null;
  unlock: (
    workspaceId: string,
    passphrase: string,
    saltB64: string,
  ) => Promise<void>;
  setKey: (workspaceId: string, key: CryptoKey) => void;
  lock: (workspaceId: string) => void;
}

const VaultKeyContext = createContext<VaultKeyContextValue | null>(null);

// Holds derived AES-GCM keys in memory only — a ref (never localStorage/sessionStorage), one per
// workspace since each workspace has its own vault passphrase/salt. Mounted inside
// apps/web/app/workspace/layout.tsx, *inside* AuthGate's authenticated render, so signing out
// (which unmounts everything under AuthGate) discards every derived key for free.
export function VaultKeyProvider({ children }: { children: ReactNode }) {
  const keysRef = useRef<Map<string, CryptoKey>>(new Map());
  // Keys themselves live in the ref (mutating it doesn't trigger a re-render); this tracks which
  // workspace ids are currently unlocked purely so components reacting to lock/unlock re-render.
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());

  const isUnlocked = useCallback(
    (workspaceId: string) => unlockedIds.has(workspaceId),
    [unlockedIds],
  );

  const getKey = useCallback(
    (workspaceId: string) => keysRef.current.get(workspaceId) ?? null,
    [],
  );

  const unlock = useCallback(
    async (workspaceId: string, passphrase: string, saltB64: string) => {
      const key = await deriveVaultKey(passphrase, saltB64);
      keysRef.current.set(workspaceId, key);
      setUnlockedIds((prev) => new Set(prev).add(workspaceId));
    },
    [],
  );

  // Stores a key the caller already derived (and, in the non-setup unlock flow, already verified
  // by test-decrypting an existing credential) — the store-and-mark-unlocked half of `unlock()`,
  // split out so a caller that already has a `CryptoKey` doesn't pay for a second, redundant
  // 310,000-iteration PBKDF2 derivation just to get it into this Map.
  const setKey = useCallback((workspaceId: string, key: CryptoKey) => {
    keysRef.current.set(workspaceId, key);
    setUnlockedIds((prev) => new Set(prev).add(workspaceId));
  }, []);

  const lock = useCallback((workspaceId: string) => {
    keysRef.current.delete(workspaceId);
    setUnlockedIds((prev) => {
      const next = new Set(prev);
      next.delete(workspaceId);
      return next;
    });
  }, []);

  // This provider wraps the entire authenticated app (apps/web/app/workspace/layout.tsx), so a
  // fresh value object every render would re-render every useVaultKey() consumer on any change
  // here, whether or not their own workspace's unlock state changed.
  const value = useMemo(
    () => ({ isUnlocked, getKey, unlock, setKey, lock }),
    [isUnlocked, getKey, unlock, setKey, lock],
  );

  return (
    <VaultKeyContext.Provider value={value}>
      {children}
    </VaultKeyContext.Provider>
  );
}

export function useVaultKey(workspaceId: string | undefined) {
  const ctx = useContext(VaultKeyContext);
  if (!ctx)
    throw new Error("useVaultKey must be used within a VaultKeyProvider");

  return {
    isUnlocked: workspaceId ? ctx.isUnlocked(workspaceId) : false,
    key: workspaceId ? ctx.getKey(workspaceId) : null,
    unlock: (passphrase: string, saltB64: string) => {
      if (!workspaceId) throw new Error("No workspace id");
      return ctx.unlock(workspaceId, passphrase, saltB64);
    },
    setKey: (key: CryptoKey) => {
      if (!workspaceId) throw new Error("No workspace id");
      ctx.setKey(workspaceId, key);
    },
    lock: () => {
      if (workspaceId) ctx.lock(workspaceId);
    },
  };
}
