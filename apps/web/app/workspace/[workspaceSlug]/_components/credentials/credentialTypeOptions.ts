import { Code2, Hash, KeyRound, LogIn, type LucideIcon } from "lucide-react";
import type { CredentialType } from "@crowscribe/types";

// Single source of truth for credential type → icon/label, consumed by the form's type selector
// (CredentialDetail.tsx), the list's per-row icon (CredentialFolderTreeNode.tsx), and the list's
// filter chips (CredentialList.tsx) — keeps the three in sync instead of maintaining the same map
// three times.
export const CREDENTIAL_TYPE_OPTIONS: {
  value: CredentialType;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "login", label: "Login", icon: KeyRound },
  { value: "oauth", label: "Google / SSO", icon: LogIn },
  { value: "api_key", label: "API Key", icon: Code2 },
  { value: "pin", label: "PIN", icon: Hash },
];

export function credentialTypeOption(type: CredentialType) {
  return CREDENTIAL_TYPE_OPTIONS.find((option) => option.value === type)!;
}
