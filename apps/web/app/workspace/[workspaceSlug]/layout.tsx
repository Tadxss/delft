"use client";

import { SidebarShell } from "./_components/SidebarShell";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <SidebarShell />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
