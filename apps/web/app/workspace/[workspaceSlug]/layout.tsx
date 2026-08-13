"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { parseWorkspaceSlug } from "@delft/shared";
import { SidebarShell } from "./_components/SidebarShell";
import { CredentialsModal } from "./_components/credentials/CredentialsModal";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceId = parseWorkspaceSlug(params.workspaceSlug);
  const [credentialsOpen, setCredentialsOpen] = useState(false);

  return (
    <div className="flex flex-1">
      <SidebarShell onOpenCredentials={() => setCredentialsOpen(true)} />
      <div className="flex-1">{children}</div>
      <CredentialsModal
        workspaceId={workspaceId}
        open={credentialsOpen}
        onClose={() => setCredentialsOpen(false)}
      />
    </div>
  );
}
