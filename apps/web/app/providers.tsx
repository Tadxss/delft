"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createSupabaseClient, SupabaseProvider, type SupabaseStorageAdapter } from "@delft/shared";

const webStorageAdapter: SupabaseStorageAdapter = {
  getItem: (key) => (typeof window === "undefined" ? null : window.localStorage.getItem(key)),
  setItem: (key, value) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  },
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Constructed once at module scope, not via a `useState` lazy initializer — React StrictMode
// (on by default in `next dev`) double-invokes component render, which would otherwise create two
// GoTrueClient instances that race to acquire the browser's session lock and both try to consume
// the same magic-link URL hash. Only one ever ends up wired to the React tree, so the "losing"
// instance's sign-in is invisible to the app. A true singleton means exactly one client, and
// exactly one `initialize()` call, per page load.
//
// Stays null (Providers then skips SupabaseProvider) until env vars are set, rather than crashing
// `pnpm dev` before `.env.local` is filled in — see apps/web/.env.local.example.
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createSupabaseClient({ url: supabaseUrl, anonKey: supabaseAnonKey, storage: webStorageAdapter })
    : null;

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  if (!supabase) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SupabaseProvider client={supabase}>{children}</SupabaseProvider>
    </QueryClientProvider>
  );
}
