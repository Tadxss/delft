export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  vaultSalt: string | null;
  createdAt: string;
}

export type WorkspaceRole = "owner" | "member";

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

export interface Page {
  id: string;
  workspaceId: string;
  parentId: string | null;
  title: string;
  content: unknown;
  isPublished: boolean;
  publishedSlug: string | null;
  createdAt: string;
  updatedAt: string;
}

// username/password/notes are never stored or transmitted as plaintext — secretCiphertext is a
// base64 AES-GCM ciphertext of a {username, password, notes} JSON payload, secretIv its base64
// 12-byte IV. Decryption happens entirely client-side via packages/shared/src/lib/vaultCrypto.ts.
export interface Credential {
  id: string;
  workspaceId: string;
  title: string;
  url: string | null;
  secretCiphertext: string;
  secretIv: string;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialSecret {
  username: string;
  password: string;
  notes: string;
}
