import { useQuery } from "@tanstack/react-query";
import type { Credential } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCredentialRow } from "../supabase/mappers";

// Direct RLS-gated read — credentials_select_member already limits this to the caller's own
// workspace. Returns title/url in plaintext for the list view; secretCiphertext/secretIv are only
// decrypted on demand when a specific entry is opened (see vaultCrypto.ts), never for the whole
// list at once.
export function useCredentials(workspaceId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<Credential[]>({
    queryKey: ["credentials", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credentials")
        .select("*")
        .eq("workspace_id", workspaceId as string)
        .order("title", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapCredentialRow);
    },
  });
}
