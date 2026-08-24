import { createContext, useContext, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@crowscribe/types";

const SupabaseContext = createContext<SupabaseClient<Database> | null>(null);

export function SupabaseProvider({
  client,
  children,
}: {
  client: SupabaseClient<Database>;
  children: ReactNode;
}) {
  return (
    <SupabaseContext.Provider value={client}>
      {children}
    </SupabaseContext.Provider>
  );
}

// Each app wraps its root in <SupabaseProvider client={createSupabaseClient(...)}>, so every hook
// below can just call this instead of threading the client through as an argument.
export function useSupabaseClient(): SupabaseClient<Database> {
  const client = useContext(SupabaseContext);
  if (!client) {
    throw new Error("useSupabaseClient must be used within a SupabaseProvider");
  }
  return client;
}
