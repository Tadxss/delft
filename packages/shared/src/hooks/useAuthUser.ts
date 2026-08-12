import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useSupabaseClient } from "../supabase/context";

export interface AuthUserState {
  user: User | null;
  isSignedIn: boolean;
  loading: boolean;
}

// The one primitive the login screen, sidebar, and every authenticated route read from — whether
// there's a real signed-in session yet, or it's still resolving.
export function useAuthUser(): AuthUserState {
  const supabase = useSupabaseClient();
  const [state, setState] = useState<AuthUserState>({
    user: null,
    isSignedIn: false,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const user = data.session?.user ?? null;
      setState({ user, isSignedIn: user != null, loading: false });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setState({ user, isSignedIn: user != null, loading: false });
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  return state;
}
