// The preset "how do you plan to use CrowScribe" choices, shown as a multi-select in the
// onboarding stepper and in the Account modal's profile form. Same curated-list rationale as
// OCCUPATIONS. Selections are persisted as a ", "-joined string in profiles.usage_intent and read
// back with `value.split(", ").filter(Boolean)`, so option labels must not themselves contain
// ", ".
export const USAGE_OPTIONS = [
  "Personal notes & journaling",
  "Work & productivity",
  "School & study",
  "Managing passwords & credentials",
  "Diagramming & brainstorming",
  "Project & task planning",
  "Other",
] as const;
