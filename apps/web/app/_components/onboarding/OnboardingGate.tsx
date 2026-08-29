"use client";

import type { ReactNode } from "react";
import { useAuthUser, useProfile } from "@crowscribe/shared";
import { OnboardingFlow } from "./OnboardingFlow";

// Sits just inside AuthGate in app/workspace/layout.tsx, so `user` is always non-null here and
// every authenticated route (picker, workspace, page/canvas editor, vault-reset — bookmarked deep
// links included) passes through exactly once. Shows the mandatory first-login stepper until the
// profile's `onboarded_at` is set; a missing profile row (pre-trigger account) counts as
// not-onboarded — OnboardingFlow's upsert creates the row.
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { user } = useAuthUser();
  const { data: profile } = useProfile(user?.id);

  if (!user || profile === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink-500">
        Loading…
      </div>
    );
  }

  if (!profile || profile.onboardedAt == null) {
    return <OnboardingFlow userId={user.id} />;
  }

  return <>{children}</>;
}
