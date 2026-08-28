"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, ChevronsLeft, KeyRound, Settings } from "lucide-react";
import {
  parseWorkspaceSlug,
  useAuthUser,
  useWorkspace,
  workspaceInitials,
} from "@crowscribe/shared";
import { AccountModal } from "../../../_components/AccountModal";
import { ThemeToggle } from "../../../_components/ThemeToggle";
import { CredentialsModal } from "./credentials/CredentialsModal";
import { WorkspaceSettingsModal } from "./WorkspaceSettingsModal";

// Icon-button styling shared with the (now workspace-picker-only) TopBar — a 28px hit target
// with a `before:` pseudo-element that pads the clickable area past the visible box.
const ICON_BUTTON =
  "relative flex h-8 w-8 items-center justify-center rounded text-ink-500 before:absolute before:-inset-1 before:content-[''] hover:bg-paper-100 hover:text-ink-800";

// The workspace's chrome, moved out of a top header and into the very top of the sidebar
// (Notion-style): an identity row (workspace name + dropdown, collapse chevron) over a row of
// action icons (Credentials, theme, account). Rendered by `Sidebar`, so it inherits the
// `group` hover context from `Sidebar`'s `<nav>` (used by the collapse button's reveal) and
// stays inside the `VaultKeyProvider` that `CredentialsModal` needs.
export function SidebarHeader({ onCollapse }: { onCollapse: () => void }) {
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceId = parseWorkspaceSlug(params.workspaceSlug);
  const router = useRouter();
  const { user } = useAuthUser();
  const { data: workspace } = useWorkspace(workspaceId);
  const isOwner = Boolean(workspace && user && workspace.ownerId === user.id);

  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on any outside pointer press — same pattern as CodeBlockView's picker.
  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  return (
    <div className="-mx-3 flex flex-col gap-1.5 border-b border-paper-200 px-3 pb-2">
      <div className="flex items-center justify-between gap-1 px-1">
        <div ref={menuRef} className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="group/ws flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-sm font-medium text-ink-700 hover:bg-paper-100 hover:text-ink-900"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-paper-100 text-[10px] font-semibold text-ink-500">
              {workspace?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- small user-uploaded image with no build-time known dimensions; next/image's optimization isn't worth the config for this
                <img
                  src={workspace.logoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                workspaceInitials(workspace?.name ?? "")
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-left">
              {workspace?.name ?? "Workspace"}
            </span>
            <ChevronDown
              size={14}
              className={`shrink-0 text-ink-400 opacity-0 transition-opacity group-hover/ws:opacity-100 group-focus-visible/ws:opacity-100 ${
                menuOpen ? "opacity-100" : ""
              }`}
            />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-md border border-paper-200 bg-paper-50 py-1 shadow-lg"
            >
              {isOwner && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-xs text-ink-700 hover:bg-paper-100"
                >
                  Workspace settings
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/workspace");
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-ink-700 hover:bg-paper-100"
              >
                Switch workspace
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse sidebar"
          className="relative shrink-0 rounded px-1.5 py-0.5 text-ink-500 opacity-100 before:absolute before:-left-2 before:-right-2.5 before:-top-3 before:-bottom-1 before:content-[''] hover:bg-paper-100 hover:text-ink-800 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
        >
          <ChevronsLeft size={14} />
        </button>
      </div>

      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => setCredentialsOpen(true)}
          aria-label="Credentials"
          className={ICON_BUTTON}
        >
          <KeyRound size={18} />
        </button>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          aria-label="Account settings"
          className={ICON_BUTTON}
        >
          <Settings size={18} />
        </button>
      </div>

      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
      <CredentialsModal
        workspaceId={workspaceId}
        open={credentialsOpen}
        onClose={() => setCredentialsOpen(false)}
      />
      <WorkspaceSettingsModal
        workspaceId={workspaceId}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
