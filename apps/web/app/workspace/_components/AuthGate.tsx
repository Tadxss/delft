"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@delft/shared";

// Every route under app/workspace/ is authenticated-only. Delft's auth is fully client-side (session
// lives in localStorage via the SupabaseStorageAdapter in app/providers.tsx, same pattern as
// votero) rather than using @supabase/ssr for server-checked routes — acceptable for a
// single-user personal tool where "flash of redirect before the client resolves the session" is a
// minor cosmetic cost, not a real access-control gap (every actual read/write is still enforced by
// RLS regardless of what the client renders).
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuthUser();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink-500">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
