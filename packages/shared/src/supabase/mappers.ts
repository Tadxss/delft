import type { Database } from "@crowscribe/types";
import type {
  Canvas,
  CanvasSummary,
  Credential,
  CredentialFolder,
  CredentialType,
  InvitableRole,
  InvitationPreview,
  Page,
  PageSummary,
  PendingInvitation,
  Profile,
  Workspace,
  WorkspaceInvitation,
  WorkspaceInvitationStatus,
  WorkspaceInvitationSummary,
  WorkspaceMember,
  WorkspaceMemberProfile,
  WorkspaceRole,
} from "@crowscribe/types";

type WorkspaceRow = Database["public"]["Tables"]["workspaces"]["Row"];
type WorkspaceMemberRow =
  Database["public"]["Tables"]["workspace_members"]["Row"];
type PageRow = Database["public"]["Tables"]["pages"]["Row"];
type CredentialRow = Database["public"]["Tables"]["credentials"]["Row"];
type CredentialFolderRow =
  Database["public"]["Tables"]["credential_folders"]["Row"];
type CanvasRow = Database["public"]["Tables"]["canvases"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type Fn = Database["public"]["Functions"];
type WorkspaceInvitationRow = Fn["invite_to_workspace"]["Returns"];
type PendingInvitationRow = Fn["get_my_pending_invitations"]["Returns"][number];
type WorkspaceInvitationSummaryRow =
  Fn["get_workspace_invitations"]["Returns"][number];
type InvitationPreviewRow = Fn["get_invitation_preview"]["Returns"][number];
type WorkspaceMemberProfileRow = Fn["get_workspace_members"]["Returns"][number];

// The Supabase client is typed snake_case (matching the Postgres columns directly, see
// packages/types/src/database.ts); every hook maps rows through here into the hand-written
// camelCase domain types (packages/types/src/domain.ts) at the boundary, so nothing downstream in
// apps/web ever has to think about which casing convention it's looking at.
export function mapWorkspaceRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    logoUrl: row.logo_url,
    description: row.description,
    vaultSalt: row.vault_salt,
    vaultWrappedKey: row.vault_wrapped_key,
    vaultWrappedKeyIv: row.vault_wrapped_key_iv,
    vaultRecoveryWrappedKey: row.vault_recovery_wrapped_key,
    vaultRecoveryWrappedKeyIv: row.vault_recovery_wrapped_key_iv,
    createdAt: row.created_at,
  };
}

export function mapWorkspaceMemberRow(
  row: WorkspaceMemberRow,
): WorkspaceMember {
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role as WorkspaceRole,
  };
}

export function mapWorkspaceInvitationRow(
  row: WorkspaceInvitationRow,
): WorkspaceInvitation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    invitedBy: row.invited_by,
    invitedEmail: row.invited_email,
    invitedUsername: row.invited_username,
    invitedUserId: row.invited_user_id,
    role: row.role as InvitableRole,
    token: row.token,
    status: row.status as WorkspaceInvitationStatus,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}

export function mapPendingInvitation(
  row: PendingInvitationRow,
): PendingInvitation {
  return {
    id: row.id,
    token: row.token,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    workspaceLogoUrl: row.workspace_logo_url,
    role: row.role as InvitableRole,
    invitedByName: row.invited_by_name,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function mapWorkspaceInvitationSummary(
  row: WorkspaceInvitationSummaryRow,
): WorkspaceInvitationSummary {
  return {
    id: row.id,
    invitedEmail: row.invited_email ?? null,
    invitedUsername: row.invited_username ?? null,
    role: row.role as InvitableRole,
    status: row.status as WorkspaceInvitationStatus,
    token: row.token,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function mapInvitationPreview(
  row: InvitationPreviewRow,
): InvitationPreview {
  return {
    workspaceName: row.workspace_name,
    workspaceLogoUrl: row.workspace_logo_url,
    inviterName: row.inviter_name,
    role: row.role as InvitableRole,
    status: row.status as WorkspaceInvitationStatus,
    expiresAt: row.expires_at,
  };
}

// `email` is null unless the caller is the workspace owner (see get_workspace_members). The
// generated RETURNS-TABLE types mark every column non-null, so a few `?? null` guards apply.
export function mapWorkspaceMemberProfile(
  row: WorkspaceMemberProfileRow,
): WorkspaceMemberProfile {
  return {
    userId: row.user_id,
    role: row.role as WorkspaceRole,
    username: row.username ?? null,
    displayName: row.display_name ?? null,
    email: row.email ?? null,
    avatarUrl: row.avatar_url ?? null,
    joinedAt: row.joined_at ?? null,
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
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Maps a pages row queried without the `content` column (see usePages.ts) — same shape as
// mapPageRow minus content, kept as a separate function rather than reusing mapPageRow so this
// never accidentally requires a column the caller didn't select.
export function mapPageSummaryRow(row: Omit<PageRow, "content">): PageSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    title: row.title,
    isPublished: row.is_published,
    publishedSlug: row.published_slug,
    position: row.position,
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
    type: row.type as CredentialType,
    secretCiphertext: row.secret_ciphertext,
    secretIv: row.secret_iv,
    position: row.position,
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
    position: row.position,
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
    isPublished: row.is_published,
    publishedSlug: row.published_slug,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Maps a canvases row queried without the `scene` column (see useCanvases.ts) — same rationale as
// mapPageSummaryRow above.
export function mapCanvasSummaryRow(
  row: Omit<CanvasRow, "scene">,
): CanvasSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    isPublished: row.is_published,
    publishedSlug: row.published_slug,
    position: row.position,
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
    company: row.company,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    usageIntent: row.usage_intent,
    onboardedAt: row.onboarded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
