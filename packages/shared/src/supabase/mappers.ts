import type { Database } from "@delft/types";
import type {
  Canvas,
  Credential,
  CredentialFolder,
  Page,
  Profile,
  Workspace,
  WorkspaceMember,
} from "@delft/types";

type WorkspaceRow = Database["public"]["Tables"]["workspaces"]["Row"];
type WorkspaceMemberRow =
  Database["public"]["Tables"]["workspace_members"]["Row"];
type PageRow = Database["public"]["Tables"]["pages"]["Row"];
type CredentialRow = Database["public"]["Tables"]["credentials"]["Row"];
type CredentialFolderRow =
  Database["public"]["Tables"]["credential_folders"]["Row"];
type CanvasRow = Database["public"]["Tables"]["canvases"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

// The Supabase client is typed snake_case (matching the Postgres columns directly, see
// packages/types/src/database.ts); every hook maps rows through here into the hand-written
// camelCase domain types (packages/types/src/domain.ts) at the boundary, so nothing downstream in
// apps/web ever has to think about which casing convention it's looking at.
export function mapWorkspaceRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    vaultSalt: row.vault_salt,
    vaultVerifier: row.vault_verifier,
    vaultVerifierIv: row.vault_verifier_iv,
    createdAt: row.created_at,
  };
}

export function mapWorkspaceMemberRow(
  row: WorkspaceMemberRow,
): WorkspaceMember {
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role as WorkspaceMember["role"],
  };
}

export function mapPageRow(row: PageRow): Page {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    title: row.title,
    content: row.content,
    isPublished: row.is_published,
    publishedSlug: row.published_slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCredentialRow(row: CredentialRow): Credential {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    folderId: row.folder_id,
    title: row.title,
    url: row.url,
    secretCiphertext: row.secret_ciphertext,
    secretIv: row.secret_iv,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCredentialFolderRow(
  row: CredentialFolderRow,
): CredentialFolder {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentFolderId: row.parent_folder_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCanvasRow(row: CanvasRow): Canvas {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    scene: row.scene,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProfileRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    occupation: row.occupation,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
