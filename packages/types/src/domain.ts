export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
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
