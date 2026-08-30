import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@crowscribe/types";
import { decryptSecret } from "./vaultCrypto";
import {
  mapCanvasRow,
  mapCredentialFolderRow,
  mapCredentialRow,
  mapPageRow,
  mapWorkspaceRow,
} from "../supabase/mappers";

// Builds the "export my data" payload (Milestone C / item 13 — GDPR portability). Everything the
// signed-in user can read via RLS: every workspace they own or belong to, its pages (full
// BlockNote content), canvases (full Excalidraw scene), credential folders, and credentials.
//
// Credential secrets are always exported in their **encrypted** form (`secretCiphertext` +
// `secretIv` + the workspace `vaultSalt`) so the export is complete and self-contained — the
// user can decrypt them offline with their vault passphrase. When a workspace's vault happens to
// be unlocked in memory at export time (VaultKeyContext), the decrypted `secret` is included
// too. Runs entirely client-side.

export interface AccountExport {
  exportedAt: string;
  account: { email: string | null };
  workspaces: WorkspaceExport[];
}
interface WorkspaceExport {
  name: string;
  role: string | null;
  createdAt: string;
  vaultSalt: string | null;
  pages: unknown[];
  canvases: unknown[];
  credentialFolders: unknown[];
  credentials: CredentialExport[];
}
interface CredentialExport {
  title: string;
  url: string | null;
  type: string;
  folderId: string | null;
  secretCiphertext: string;
  secretIv: string;
  // Present only when the vault was unlocked at export time.
  secret?: Record<string, unknown>;
}

export async function buildAccountExport(
  supabase: SupabaseClient<Database>,
  accountEmail: string | null,
  getVaultKey: (workspaceId: string) => CryptoKey | null,
): Promise<AccountExport> {
  const { data: wsRows, error } = await supabase.from("workspaces").select("*");
  if (error) throw error;
  const workspaces = (wsRows ?? []).map(mapWorkspaceRow);

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role");
  const roleByWs = new Map(
    (memberRows ?? []).map((m) => [m.workspace_id, m.role]),
  );

  const out: WorkspaceExport[] = [];
  for (const ws of workspaces) {
    const [pages, canvases, folders, creds] = await Promise.all([
      supabase.from("pages").select("*").eq("workspace_id", ws.id),
      supabase.from("canvases").select("*").eq("workspace_id", ws.id),
      supabase.from("credential_folders").select("*").eq("workspace_id", ws.id),
      supabase.from("credentials").select("*").eq("workspace_id", ws.id),
    ]);

    const key = getVaultKey(ws.id);
    const credentials: CredentialExport[] = [];
    for (const row of creds.data ?? []) {
      const c = mapCredentialRow(row);
      const entry: CredentialExport = {
        title: c.title,
        url: c.url,
        type: c.type,
        folderId: c.folderId,
        secretCiphertext: c.secretCiphertext,
        secretIv: c.secretIv,
      };
      if (key) {
        try {
          entry.secret = (await decryptSecret(
            key,
            c.secretCiphertext,
            c.secretIv,
          )) as unknown as Record<string, unknown>;
        } catch {
          // key doesn't match this ciphertext — leave the encrypted form only
        }
      }
      credentials.push(entry);
    }

    out.push({
      name: ws.name,
      role: roleByWs.get(ws.id) ?? null,
      createdAt: ws.createdAt,
      vaultSalt: ws.vaultSalt,
      pages: (pages.data ?? []).map(mapPageRow),
      canvases: (canvases.data ?? []).map(mapCanvasRow),
      credentialFolders: (folders.data ?? []).map(mapCredentialFolderRow),
      credentials,
    });
  }

  return {
    exportedAt: new Date().toISOString(),
    account: { email: accountEmail },
    workspaces: out,
  };
}
