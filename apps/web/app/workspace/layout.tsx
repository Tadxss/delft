"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { KeyRound, Settings } from "lucide-react";
import { parseWorkspaceSlug, VaultKeyProvider } from "@crowscribe/shared";
import { AccountModal } from "../_components/AccountModal";
import { AuthGate } from "../_components/AuthGate";
import { ThemeToggle } from "../_components/ThemeToggle";
import { CredentialsModal } from "./[workspaceSlug]/_components/credentials/CredentialsModal";

function TopBar() {
  const params = useParams<{ workspaceSlug?: string }>();
  const workspaceId = params.workspaceSlug
    ? parseWorkspaceSlug(params.workspaceSlug)
    : undefined;
  const [accountOpen, setAccountOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-paper-200 bg-paper-100 px-4">
      <Link
        href="/workspace"
        className="text-base font-semibold tracking-tight text-ink-800"
      >
        CrowScribe
      </Link>
      <div className="flex items-center gap-1">
        {workspaceId && (
          <button
            type="button"
            onClick={() => setCredentialsOpen(true)}
            aria-label="Credentials"
            className="relative flex h-8 w-8 items-center justify-center rounded text-ink-500 before:absolute before:-left-2.5 before:-right-0.5 before:-top-2 before:-bottom-2 before:content-[''] hover:bg-paper-100 hover:text-ink-800"
          >
            <KeyRound size={18} />
          </button>
        )}
        <ThemeToggle />
        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          aria-label="Account settings"
          className="relative flex h-8 w-8 items-center justify-center rounded text-ink-500 before:absolute before:-left-0.5 before:-right-2.5 before:-top-2 before:-bottom-2 before:content-[''] hover:bg-paper-100 hover:text-ink-800"
        >
          <Settings size={18} />
        </button>
      </div>
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
      {workspaceId && (
        <CredentialsModal
          workspaceId={workspaceId}
          open={credentialsOpen}
          onClose={() => setCredentialsOpen(false)}
        />
      )}
    </header>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <VaultKeyProvider>
        <div className="flex min-h-screen flex-col">
          <TopBar />
          <div className="flex flex-1">{children}</div>
        </div>
      </VaultKeyProvider>
    </AuthGate>
  );
}
