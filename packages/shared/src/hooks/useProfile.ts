import { useQuery } from "@tanstack/react-query";
import type { Profile } from "@crowscribe/types";
import { useSupabaseClient } from "../supabase/context";
import { mapProfileRow } from "../supabase/mappers";

// Every user gets a blank row auto-created on signup (handle_new_user_profile trigger), but a
// pre-existing account (created before that trigger shipped) may not have one yet — `.maybeSingle()`
// so a missing row resolves to `null` instead of throwing, letting the UI treat "no row yet" the
// same as "row exists but every field is empty."
export function useProfile(userId: string | undefined) {
  const supabase = useSupabaseClient();

  return useQuery<Profile | null>({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId as string)
        .maybeSingle();
      if (error) throw error;
      return data ? mapProfileRow(data) : null;
    },
  });
}
