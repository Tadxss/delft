import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Database, Profile } from "@delft/types";
import { useSupabaseClient } from "../supabase/context";
import { mapProfileRow } from "../supabase/mappers";

type ProfilesUpsert = Database["public"]["Tables"]["profiles"]["Insert"];

export interface UpsertProfileInput {
  id: string;
  username?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  occupation?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

// `upsert` rather than plain `update`: the auto-create-on-signup trigger only covers accounts
// created after it shipped, so a pre-existing user's very first save has no row to update yet —
// upsert self-heals that without needing a manual backfill migration.
export function useUpsertProfile() {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation<Profile, Error, UpsertProfileInput>({
    mutationFn: async ({
      id,
      username,
      firstName,
      middleName,
      lastName,
      occupation,
      bio,
      avatarUrl,
    }) => {
      const patch: ProfilesUpsert = { id };
      if (username !== undefined) patch.username = username;
      if (firstName !== undefined) patch.first_name = firstName;
      if (middleName !== undefined) patch.middle_name = middleName;
      if (lastName !== undefined) patch.last_name = lastName;
      if (occupation !== undefined) patch.occupation = occupation;
      if (bio !== undefined) patch.bio = bio;
      if (avatarUrl !== undefined) patch.avatar_url = avatarUrl;

      const { data, error } = await supabase
        .from("profiles")
        .upsert(patch, { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;
      return mapProfileRow(data);
    },
    onSuccess: (profile) => {
      queryClient.setQueryData<Profile>(["profile", profile.id], profile);
    },
  });
}
