import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Credential, Database } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCredentialRow } from "../supabase/mappers";

type CredentialsUpdate = Database["public"]["Tables"]["credentials"]["Update"];

export interface UpdateCredentialInput {
  id: string;
  title?: string;
  url?: string | null;
  secretCiphertext?: string;
  secretIv?: string;
}

// `updated_at` is maintained server-side by credentials_set_updated_at, not passed in. Callers
// pass secretCiphertext/secretIv together (re-encrypt the whole {username,password,notes} payload
// with a fresh IV) whenever any of the three plaintext fields change — see vaultCrypto.ts.
export function useUpdateCredential() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Credential, Error, UpdateCredentialInput>({
    mutationFn: async ({ id, title, url, secretCiphertext, secretIv }) => {
      const patch: CredentialsUpdate = {};
      if (title !== undefined) patch.title = title;
      if (url !== undefined) patch.url = url;
      if (secretCiphertext !== undefined) patch.secret_ciphertext = secretCiphertext;
      if (secretIv !== undefined) patch.secret_iv = secretIv;

      const { data, error } = await supabase
        .from("credentials")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapCredentialRow(data);
    },
    onSuccess: (credential) => {
      queryClient.setQueryData<Credential>(["credential", credential.id], credential);
      queryClient.invalidateQueries({ queryKey: ["credentials", credential.workspaceId] });
    },
  });
}
