import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Credential, CredentialType, Database } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapCredentialRow } from "../supabase/mappers";

type CredentialsUpdate = Database["public"]["Tables"]["credentials"]["Update"];

export interface UpdateCredentialInput {
  id: string;
  folderId?: string | null;
  title?: string;
  url?: string | null;
  type?: CredentialType;
  secretCiphertext?: string;
  secretIv?: string;
  position?: number;
}

// `updated_at` is maintained server-side by credentials_set_updated_at, not passed in. Callers
// pass secretCiphertext/secretIv together (re-encrypt the whole {username,password,notes} payload
// with a fresh IV) whenever any of the three plaintext fields change — see vaultCrypto.ts.
export function useUpdateCredential() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Credential, Error, UpdateCredentialInput>({
    mutationFn: async ({
      id,
      folderId,
      title,
      url,
      type,
      secretCiphertext,
      secretIv,
      position,
    }) => {
      const patch: CredentialsUpdate = {};
      if (folderId !== undefined) patch.folder_id = folderId;
      if (title !== undefined) patch.title = title;
      if (url !== undefined) patch.url = url;
      if (type !== undefined) patch.type = type;
      if (secretCiphertext !== undefined)
        patch.secret_ciphertext = secretCiphertext;
      if (secretIv !== undefined) patch.secret_iv = secretIv;
      if (position !== undefined) patch.position = position;

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
      queryClient.setQueryData<Credential>(
        ["credential", credential.id],
        credential,
      );
      queryClient.invalidateQueries({
        queryKey: ["credentials", credential.workspaceId],
      });
    },
  });
}
