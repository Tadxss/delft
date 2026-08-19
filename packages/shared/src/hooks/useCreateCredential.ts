import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Credential, CredentialType } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCredentialRow } from "../supabase/mappers";

export interface CreateCredentialInput {
  workspaceId: string;
  folderId?: string | null;
  title: string;
  url: string | null;
  type: CredentialType;
  secretCiphertext: string;
  secretIv: string;
}

// Callers encrypt via vaultCrypto.ts's encryptSecret() before calling this — this hook only ever
// sees ciphertext, never the plaintext username/password/notes.
export function useCreateCredential() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Credential, Error, CreateCredentialInput>({
    mutationFn: async ({
      workspaceId,
      folderId = null,
      title,
      url,
      type,
      secretCiphertext,
      secretIv,
    }) => {
      const { data, error } = await supabase
        .from("credentials")
        .insert({
          workspace_id: workspaceId,
          folder_id: folderId,
          title,
          url,
          type,
          secret_ciphertext: secretCiphertext,
          secret_iv: secretIv,
        })
        .select()
        .single();
      if (error) throw error;
      return mapCredentialRow(data);
    },
    onSuccess: (credential) => {
      // Merge synchronously (not just invalidate) so a caller that immediately selects the new
      // credential's id (e.g. CredentialDetail's onSaved) doesn't race a background refetch —
      // without this, a consumer checking "does this id exist in the credentials list yet" can
      // transiently see it missing and incorrectly treat it as deleted.
      queryClient.setQueryData<Credential[]>(
        ["credentials", credential.workspaceId],
        (old) => (old ? [...old, credential] : [credential]),
      );
      queryClient.invalidateQueries({
        queryKey: ["credentials", credential.workspaceId],
      });
    },
  });
}
