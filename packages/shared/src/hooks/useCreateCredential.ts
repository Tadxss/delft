import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Credential } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCredentialRow } from "../supabase/mappers";

export interface CreateCredentialInput {
  workspaceId: string;
  title: string;
  url: string | null;
  secretCiphertext: string;
  secretIv: string;
}

// Callers encrypt via vaultCrypto.ts's encryptSecret() before calling this — this hook only ever
// sees ciphertext, never the plaintext username/password/notes.
export function useCreateCredential() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Credential, Error, CreateCredentialInput>({
    mutationFn: async ({ workspaceId, title, url, secretCiphertext, secretIv }) => {
      const { data, error } = await supabase
        .from("credentials")
        .insert({
          workspace_id: workspaceId,
          title,
          url,
          secret_ciphertext: secretCiphertext,
          secret_iv: secretIv,
        })
        .select()
        .single();
      if (error) throw error;
      return mapCredentialRow(data);
    },
    onSuccess: (credential) => {
      queryClient.invalidateQueries({ queryKey: ["credentials", credential.workspaceId] });
    },
  });
}
