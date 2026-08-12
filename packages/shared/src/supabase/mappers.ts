import type { Database } from "@delft/types";
import type { Page, Workspace, WorkspaceMember } from "@delft/types";

type WorkspaceRow = Database["public"]["Tables"]["workspaces"]["Row"];
type WorkspaceMemberRow = Database["public"]["Tables"]["workspace_members"]["Row"];
type PageRow = Database["public"]["Tables"]["pages"]["Row"];

// The Supabase client is typed snake_case (matching the Postgres columns directly, see
// packages/types/src/database.ts); every hook maps rows through here into the hand-written
// camelCase domain types (packages/types/src/domain.ts) at the boundary, so nothing downstream in
// apps/web ever has to think about which casing convention it's looking at.
export function mapWorkspaceRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    createdAt: row.created_at,
  };
}

export function mapWorkspaceMemberRow(row: WorkspaceMemberRow): WorkspaceMember {
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
