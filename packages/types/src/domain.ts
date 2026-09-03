export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  // Public URL of the workspace's uploaded logo image (in the `workspace-logos` Storage bucket),
  // or null — the UI falls back to the workspace's initials when unset.
  logoUrl: string | null;
  // Optional free-text description, editable in Workspace settings.
  description: string | null;
  createdAt: string;
}

// One member's private vault in one workspace (Build Order step 92 — per-member vaults). The
// key-wrap material used to live on `workspaces` (one vault per workspace, the owner's); it's now
// a per-(workspace, user) row so every member can have their own independent vault. Held only
// after that member runs vault setup — no row means "no vault yet" (VaultUnlockPanel shows the
// setup flow). See packages/shared/src/lib/vaultCrypto.ts for what each field holds.
export interface WorkspaceVault {
  workspaceId: string;
  userId: string;
  salt: string;
  // The Vault Master Key (VMK), AES-GCM wrapped under the passphrase-derived key and, separately,
  // under a one-time-shown recovery key. Either factor alone unwraps the VMK.
  wrappedKey: string;
  wrappedKeyIv: string;
  recoveryWrappedKey: string;
  recoveryWrappedKeyIv: string;
}

export type WorkspaceRole = "owner" | "editor" | "viewer";

// The two roles an invitation can grant (never "owner").
export type InvitableRole = Exclude<WorkspaceRole, "owner">;

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

export type WorkspaceInvitationStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "declined";

// A row of `workspace_invitations` (as returned by invite_to_workspace). Exactly one of
// invitedEmail / invitedUsername is set.
export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  invitedBy: string;
  invitedEmail: string | null;
  invitedUsername: string | null;
  invitedUserId: string | null;
  role: InvitableRole;
  token: string;
  status: WorkspaceInvitationStatus;
  expiresAt: string;
  createdAt: string;
  respondedAt: string | null;
}

// One pending invite shown to the invitee on their workspace picker (get_my_pending_invitations).
export interface PendingInvitation {
  id: string;
  token: string;
  workspaceId: string;
  workspaceName: string;
  workspaceLogoUrl: string | null;
  role: InvitableRole;
  invitedByName: string;
  expiresAt: string;
  createdAt: string;
}

// One pending invite shown to the owner in the manage-members UI (get_workspace_invitations).
export interface WorkspaceInvitationSummary {
  id: string;
  invitedEmail: string | null;
  invitedUsername: string | null;
  role: InvitableRole;
  status: WorkspaceInvitationStatus;
  token: string;
  expiresAt: string;
  createdAt: string;
}

// Non-sensitive display fields for the /invite/[token] screen (get_invitation_preview).
export interface InvitationPreview {
  workspaceName: string;
  workspaceLogoUrl: string | null;
  inviterName: string;
  role: InvitableRole;
  status: WorkspaceInvitationStatus;
  expiresAt: string;
}

// A member row for the manage-members UI (get_workspace_members). `email` is only populated when
// the caller is the workspace owner.
export interface WorkspaceMemberProfile {
  userId: string;
  role: WorkspaceRole;
  username: string | null;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  joinedAt: string | null;
}

export interface Page {
  id: string;
  workspaceId: string;
  parentId: string | null;
  title: string;
  content: unknown;
  isPublished: boolean;
  publishedSlug: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

// Everything about a Page except its (potentially large) jsonb `content` — what the sidebar tree
// actually needs to render. Fetching this instead of full Page[] avoids downloading every page's
// full BlockNote document just to show a title in a list; see usePages.ts.
export type PageSummary = Omit<Page, "content">;

// Determines which fields the create/edit form shows and collects into CredentialSecret below —
// "login" carries username+password, "oauth" only an account/email (no password stored, since
// sign-in happens through the provider), "api_key" a single token, "pin" a single short code.
export type CredentialType = "login" | "oauth" | "api_key" | "pin";

// username/password/notes are never stored or transmitted as plaintext — secretCiphertext is a
// base64 AES-GCM ciphertext of a CredentialSecret JSON payload (its exact shape depends on
// `type`, see CredentialSecret below), secretIv its base64 12-byte IV. Decryption happens entirely
// client-side via packages/shared/src/lib/vaultCrypto.ts. `type` itself is plaintext, unlike the
// secret fields — the list view needs it for a per-row icon/filter without decrypting every row.
export interface Credential {
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  url: string | null;
  type: CredentialType;
  secretCiphertext: string;
  secretIv: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

// Only the fields relevant to a credential's `type` are ever populated — see CredentialType above
// and CredentialDetail.tsx's buildSecret(). `notes` is the one field every type carries.
export interface CredentialSecret {
  username?: string;
  password?: string;
  apiKey?: string;
  pin?: string;
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
  position: number;
  createdAt: string;
  updatedAt: string;
}

// One row per user (id doubles as PK and FK to auth.users), not workspace-scoped. `occupation` is
// plain text, not an enum — the client renders a curated dropdown (apps/web/app/_lib/occupations.ts)
// with a trailing "Other" option that saves a free-text value directly into this same field.
export interface Profile {
  id: string;
  username: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  occupation: string | null;
  company: string | null;
  bio: string | null;
  avatarUrl: string | null;
  // How the user plans to use the app — a ", "-joined list of preset labels (see usageOptions.ts),
  // collected during onboarding.
  usageIntent: string | null;
  // Null until the user finishes the first-login onboarding stepper; set once, never cleared.
  onboardedAt: string | null;
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
  isPublished: boolean;
  publishedSlug: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

// Everything about a Canvas except its (potentially large) jsonb `scene` — same rationale as
// PageSummary above; see useCanvases.ts.
export type CanvasSummary = Omit<Canvas, "scene">;
