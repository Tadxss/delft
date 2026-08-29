import { AuthGate } from "../_components/AuthGate";

// The invite-accept route needs a signed-in user (the accept RPC is `to authenticated`), but not
// the workspace chrome, sidebar, vault provider, or the onboarding gate — a fresh invitee should
// be able to accept before finishing onboarding. Just AuthGate.
export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGate>{children}</AuthGate>;
}
