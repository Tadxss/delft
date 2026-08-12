import { SidebarShell } from "./_components/SidebarShell";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1">
      <SidebarShell />
      <div className="flex-1">{children}</div>
    </div>
  );
}
