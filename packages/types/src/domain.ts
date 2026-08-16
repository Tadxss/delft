export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  vaultSalt: string | null;
  vaultVerifier: string | null;
  vaultVerifierIv: string | null;
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
  folderId: string | null;
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

// A folder is a pure container — name only, no secret payload of its own. Nests arbitrarily deep
// via parentFolderId, mirroring Page's parentId tree, but with deliberately different delete
// semantics (see supabase/migrations/20260816090000_credential_folders.sql): deleting a folder
// never destroys the credentials inside it, only cascades away empty sub-folder shells.
export interface CredentialFolder {
  id: string;
  workspaceId: string;
  parentFolderId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// One row per user (id doubles as PK and FK to auth.users), not workspace-scoped. `occupation` is
// plain text, not an enum — the client renders a curated dropdown (apps/web/app/_lib/occupations.ts)
// with a trailing "Other" option that saves a free-text value directly into this same field.
export interface Profile {
  id: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  occupation: string | null;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// `scene` is Excalidraw's own { elements, appState } shape (its onChange callback's first two
// arguments) — deliberately never the third `files` argument, so no image/binary data is ever
// persisted. Typed `unknown` here since Excalidraw's own types aren't imported into this
// framework-agnostic package; apps/web casts at the boundary.
export interface Canvas {
  id: string;
  workspaceId: string;
  title: string;
  scene: unknown;
  createdAt: string;
  updatedAt: string;
}
