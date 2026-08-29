-- Profile: an optional `company` field, a `usage_intent` field (how the user plans to use the
-- app — a ", "-joined list of preset labels), and `onboarded_at` — the first-login signal that
-- gates the mandatory onboarding stepper (see app/_components/onboarding/OnboardingGate.tsx).
--
-- Nullable text columns with the same char_length CHECK pattern as 20260818000010 /
-- 20260828181053 — no RLS or grant change needed (the existing
-- `grant select, insert, update on public.profiles to authenticated` + profiles_update_own /
-- profiles_insert_own policies already cover new columns). handle_new_user_profile is unchanged:
-- new rows get all three columns null, and a null onboarded_at is what makes the gate show.

alter table public.profiles
  add column company      text,
  add column usage_intent text,
  add column onboarded_at  timestamptz;

alter table public.profiles add constraint profiles_company_length
  check (company is null or char_length(company) <= 200);
alter table public.profiles add constraint profiles_usage_intent_length
  check (usage_intent is null or char_length(usage_intent) <= 500);

-- Existing accounts are already using the app — don't wall them behind first-run onboarding.
-- Only rows created after this migration keep a null onboarded_at.
update public.profiles set onboarded_at = now() where onboarded_at is null;
