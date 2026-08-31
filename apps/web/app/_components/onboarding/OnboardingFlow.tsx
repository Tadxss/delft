"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProfile, useSignOut, useUpsertProfile } from "@crowscribe/shared";
import { OCCUPATIONS } from "../../_lib/occupations";
import { Button } from "../Button";
import { FormLabel } from "../FormLabel";
import { Heading } from "../Heading";
import { Input, Select, Textarea } from "../Input";
import { UsageCheckboxes } from "../UsageCheckboxes";

const TOTAL_STEPS = 5;

const STEP_TITLES: Record<number, { title: string; hint: string }> = {
  1: { title: "What's your name?", hint: "This is how you'll show up across CrowScribe." },
  2: { title: "What do you do?", hint: "Pick the closest match — or choose Other." },
  3: { title: "Where do you work?", hint: "Optional — the company or organization you're under." },
  4: { title: "A short bio", hint: "Optional — a sentence or two about you." },
  5: {
    title: "How will you use CrowScribe?",
    hint: "Pick everything that applies — at least one.",
  },
};

// Mandatory first-login stepper. Rendered by OnboardingGate whenever the signed-in user's profile
// has a null `onboarded_at`; there's no way past it but finishing or signing out (deliberately —
// see the confirmed plan). Not a Modal: full-screen, no backdrop dismiss, no close button.
export function OnboardingFlow({ userId }: { userId: string }) {
  const router = useRouter();
  const { data: profile } = useProfile(userId);
  const upsertProfile = useUpsertProfile();
  const signOut = useSignOut();

  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [occupation, setOccupation] = useState("");
  const [customOccupation, setCustomOccupation] = useState("");
  const [company, setCompany] = useState("");
  const [bio, setBio] = useState("");
  const [usage, setUsage] = useState<string[]>([]);
  const seededRef = useRef(false);

  // Seed once from the profile row — a partially-filled row (e.g. the user set some fields in a
  // previous session that crashed before finishing) shouldn't be re-blanked. Same guard +
  // loading-gate pattern as AccountModal's ProfileForm.
  useEffect(() => {
    if (seededRef.current || profile === undefined) return;
    seededRef.current = true;
    setFirstName(profile?.firstName ?? "");
    setMiddleName(profile?.middleName ?? "");
    setLastName(profile?.lastName ?? "");
    setCompany(profile?.company ?? "");
    setBio(profile?.bio ?? "");
    setUsage(profile?.usageIntent?.split(", ").filter(Boolean) ?? []);
    const storedOcc = profile?.occupation ?? "";
    if (storedOcc && !(OCCUPATIONS as readonly string[]).includes(storedOcc)) {
      setOccupation("Other");
      setCustomOccupation(storedOcc);
    } else {
      setOccupation(storedOcc);
      setCustomOccupation("");
    }
  }, [profile]);

  const finalOccupation =
    occupation === "Other" ? customOccupation.trim() : occupation;

  const stepValid =
    step === 1
      ? firstName.trim() !== "" && lastName.trim() !== ""
      : step === 2
        ? finalOccupation !== ""
        : step === 5
          ? usage.length > 0
          : true; // steps 3 and 4 are optional

  function handleNext() {
    if (!stepValid) return;
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
      return;
    }
    upsertProfile.mutate(
      {
        id: userId,
        firstName: firstName.trim() || null,
        middleName: middleName.trim() || null,
        lastName: lastName.trim() || null,
        occupation: finalOccupation || null,
        company: company.trim() || null,
        bio: bio.trim() || null,
        usageIntent: usage.join(", ") || null,
        onboardedAt: new Date().toISOString(),
      },
      { onSuccess: () => router.replace("/workspace") },
    );
  }

  const { title, hint } = STEP_TITLES[step]!;

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-100 p-4">
      <div className="flex w-full max-w-md flex-col gap-5">
        <div
          data-testid="onboarding"
          className="flex flex-col gap-5 rounded-lg border border-paper-200 bg-paper-50 p-8 shadow-lg"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${
                    i < step ? "bg-accent-500" : "bg-paper-200"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-ink-400">
              Step {step} of {TOTAL_STEPS}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <Heading level="content-compact" as="h2">
              {title}
            </Heading>
            <p className="text-sm text-ink-500">{hint}</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleNext();
            }}
            className="flex flex-col gap-3"
          >
            {step === 1 && (
              <>
                <div className="flex flex-col gap-1.5">
                  <FormLabel htmlFor="onboarding-first-name">First name</FormLabel>
                  <Input
                    id="onboarding-first-name"
                    maxLength={100}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FormLabel htmlFor="onboarding-middle-name">
                    Middle name (optional)
                  </FormLabel>
                  <Input
                    id="onboarding-middle-name"
                    maxLength={100}
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FormLabel htmlFor="onboarding-last-name">Last name</FormLabel>
                  <Input
                    id="onboarding-last-name"
                    maxLength={100}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-1.5">
                <FormLabel htmlFor="onboarding-occupation">Occupation</FormLabel>
                <Select
                  id="onboarding-occupation"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                >
                  <option value="">Select an occupation</option>
                  {OCCUPATIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  <option value="Other">Other</option>
                </Select>
                {occupation === "Other" && (
                  <Input
                    value={customOccupation}
                    maxLength={200}
                    onChange={(e) => setCustomOccupation(e.target.value)}
                    placeholder="Enter your occupation"
                  />
                )}
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-1.5">
                <FormLabel htmlFor="onboarding-company">
                  Company (optional)
                </FormLabel>
                <Input
                  id="onboarding-company"
                  maxLength={200}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-1.5">
                <FormLabel htmlFor="onboarding-bio">Bio (optional)</FormLabel>
                <Textarea
                  id="onboarding-bio"
                  maxLength={2000}
                  rows={4}
                  className="resize-none"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>
            )}

            {step === 5 && (
              <UsageCheckboxes value={usage} onChange={setUsage} />
            )}

            {upsertProfile.isError && (
              <p className="text-xs text-red-700">
                {upsertProfile.error.message}
              </p>
            )}

            <div className="mt-1 flex items-center justify-between gap-2">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep((s) => s - 1)}
                >
                  Back
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="submit"
                disabled={!stepValid || upsertProfile.isPending}
              >
                {step < TOTAL_STEPS
                  ? "Next"
                  : upsertProfile.isPending
                    ? "Finishing…"
                    : "Finish"}
              </Button>
            </div>
          </form>
        </div>

        <button
          type="button"
          onClick={() =>
            signOut.mutate(undefined, {
              // Hard nav, not router.replace — see AccountModal.handleSignOut: a soft nav lets
              // the App Router restore the magic-link `#access_token` hash after sign-out.
              onSuccess: () => window.location.replace("/"),
            })
          }
          className="self-center text-xs text-ink-400 hover:text-ink-700"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
