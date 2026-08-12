"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthUser, useSignOut } from "@delft/shared";
import { AuthGate } from "./_components/AuthGate";
import { ThemeToggle } from "../_components/ThemeToggle";

function TopBar() {
  const router = useRouter();
  const { user } = useAuthUser();
  const signOut = useSignOut();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-paper-200 bg-paper-100 px-4">
      <Link href="/workspace" className="text-sm font-semibold tracking-tight text-ink-800">
        Delft
      </Link>
      <div className="flex items-center gap-3 text-xs text-ink-500">
        <ThemeToggle />
        <span>{user?.email}</span>
        <button
          type="button"
          onClick={() => signOut.mutate(undefined, { onSuccess: () => router.replace("/") })}
          className="rounded px-2 py-1 hover:bg-paper-100"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <div className="flex flex-1">{children}</div>
      </div>
    </AuthGate>
  );
}
