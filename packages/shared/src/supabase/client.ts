import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@delft/types";
import type { SupabaseStorageAdapter } from "./storage";

export interface CreateSupabaseClientOptions {
  url: string;
  anonKey: string;
  storage: SupabaseStorageAdapter;
}

// Each app calls this once with its own env vars (NEXT_PUBLIC_* on web, a future native app's own
// prefix later) and its own storage adapter, so a future apps/mobile addition is a "pass
// AsyncStorage" change here, not a rewrite of the auth plumbing.
export function createSupabaseClient({
  url,
  anonKey,
  storage,
}: CreateSupabaseClientOptions): SupabaseClient<Database> {
  return createClient<Database>(url, anonKey, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      // Delft uses real magic-link email sign-in (not OTP-code), so the session token does land
      // in the URL on the auth callback — unlike votero's anonymous/OTP-only flow, this needs to
      // stay enabled so signInWithOtp()'s emailed link actually completes the sign-in.
      detectSessionInUrl: true,
    },
  });
}
