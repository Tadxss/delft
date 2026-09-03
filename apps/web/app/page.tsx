"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  useAuthUser,
  useEmailForUsername,
  useSignInWithGoogle,
  useSignInWithMagicLink,
  useSignInWithPassword,
} from "@crowscribe/shared";
import { Button } from "./_components/Button";
import { FormLabel } from "./_components/FormLabel";
import { Heading } from "./_components/Heading";
import { Input } from "./_components/Input";
import { Turnstile } from "./_components/Turnstile";

type Step = "email" | "password" | "sent";

// The CAPTCHA gates the two auth calls that create/authenticate an account (magic link +
// password) — both happen from the "password" step. Google OAuth doesn't take a captcha token.
const HAS_CAPTCHA = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

// Google's official four-color "G" logomark, per Google's Sign In branding guidelines.
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.8741 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.8064 5.9564-2.1818l-2.9087-2.2581c-.8064.54-1.8368.8591-3.0477.8591-2.3436 0-4.3282-1.5831-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.9641 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.9641 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4409 1.3459l2.5814-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6564 3.5795 9 3.5795z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  // resolvedTheme is undefined on the server/first client render, so the
  // Google button's colors must not depend on it until mounted, or the client's real (possibly
  // "dark") value diverges from the deterministic light-mode SSR output and React flags a
  // hydration mismatch.
  const [mounted, setMounted] = useState(false);
  const [justDeleted, setJustDeleted] = useState(false);
  useEffect(() => {
    setMounted(true);
    try {
      if (sessionStorage.getItem("crowscribe:account-deleted")) {
        setJustDeleted(true);
        sessionStorage.removeItem("crowscribe:account-deleted");
      }
    } catch {
      // storage disabled — no banner, no harm
    }
  }, []);
  const { user, loading } = useAuthUser();
  const signIn = useSignInWithMagicLink();
  const signInWithPassword = useSignInWithPassword();
  const signInWithGoogle = useSignInWithGoogle();
  const emailForUsername = useEmailForUsername();
  // `identifierInput` is exactly what the user typed (what "Change" restores); `email` is the
  // resolved address actually used for auth calls — the same value when the user typed an email
  // directly, but the looked-up address when they typed a username instead.
  const [identifierInput, setIdentifierInput] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usernameNotFound, setUsernameNotFound] = useState(false);
  const [step, setStep] = useState<Step>("email");
  // Turnstile token is single-use — bump `captchaNonce` after each attempt to remount the widget.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const captchaReady = !HAS_CAPTCHA || Boolean(captchaToken);
  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaNonce((n) => n + 1);
  }

  // Magic-link / Google / password sign-in all land back on "/" with a session; once it resolves,
  // hand off to the workspace.
  useEffect(() => {
    if (!loading && user) router.replace("/workspace");
  }, [loading, user, router]);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifierInput) return;
    setUsernameNotFound(false);

    if (identifierInput.includes("@")) {
      setEmail(identifierInput);
      setStep("password");
      return;
    }

    const resolved = await emailForUsername.mutateAsync(identifierInput);
    if (!resolved) {
      setUsernameNotFound(true);
      return;
    }
    setEmail(resolved);
    setStep("password");
  }

  function handleChangeEmail() {
    setPassword("");
    setUsernameNotFound(false);
    signInWithPassword.reset();
    setStep("email");
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || !captchaReady) return;
    signInWithPassword.mutate(
      { email, password, captchaToken: captchaToken ?? undefined },
      { onSettled: resetCaptcha },
    );
  }

  function handleMagicLinkClick() {
    if (!captchaReady) return;
    signIn.mutate(
      {
        email,
        redirectTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
        captchaToken: captchaToken ?? undefined,
      },
      {
        onSuccess: () => setStep("sent"),
        onSettled: resetCaptcha,
      },
    );
  }

  function handleGoogleClick() {
    // signInWithOAuth navigates this tab to Google itself; it returns here once consent completes.
    signInWithGoogle.mutate({
      redirectTo:
        typeof window !== "undefined" ? window.location.origin : undefined,
    });
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- points at our own /apple-icon route (already a properly-sized generated PNG); next/image's optimization pipeline isn't worth the config for this */}
        <img src="/apple-icon" width={48} height={48} alt="" className="rounded-xl" />
        <Heading level="brand">CrowScribe</Heading>
        <p className="max-w-sm text-sm text-ink-500">
          Where ideas take flight.
        </p>
      </div>

      {justDeleted && (
        <p className="max-w-sm rounded-md border border-paper-200 bg-paper-100 px-4 py-3 text-center text-sm text-ink-600">
          Your account has been deleted. Thanks for trying CrowScribe.
        </p>
      )}

      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-paper-200 bg-paper-100 p-6 shadow-sm">
        {step === "email" && (
          <>
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={signInWithGoogle.isPending}
              style={
                mounted && resolvedTheme === "dark"
                  ? {
                      backgroundColor: "#131314",
                      borderColor: "#8e918f",
                      color: "#e3e3e3",
                    }
                  : {
                      backgroundColor: "#ffffff",
                      borderColor: "#747775",
                      color: "#1f1f1f",
                    }
              }
              className="flex h-10 items-center justify-center gap-3 rounded-md border text-sm font-medium tracking-wide transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <GoogleLogo />
              {signInWithGoogle.isPending
                ? "Redirecting…"
                : "Continue with Google"}
            </button>
            {signInWithGoogle.isError && (
              <p className="-mt-2 text-xs text-red-700">
                {signInWithGoogle.error.message}
              </p>
            )}

            <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-ink-400">
              <div className="h-px flex-1 bg-paper-200" />
              or
              <div className="h-px flex-1 bg-paper-200" />
            </div>

            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
              <FormLabel htmlFor="identifier">Email or username</FormLabel>
              <Input
                id="identifier"
                type="text"
                required
                autoComplete="username"
                value={identifierInput}
                onChange={(e) => {
                  setIdentifierInput(e.target.value);
                  setUsernameNotFound(false);
                }}
                placeholder="you@example.com"
              />
              <Button
                type="submit"
                disabled={!identifierInput || emailForUsername.isPending}
              >
                {emailForUsername.isPending ? "Checking…" : "Continue"}
              </Button>
              {usernameNotFound && (
                <p className="text-xs text-red-700">
                  No account found with that username.
                </p>
              )}
            </form>
          </>
        )}

        {step === "password" && (
          <>
            <div className="flex items-center justify-between text-sm text-ink-600">
              <span className="truncate">{email}</span>
              <button
                type="button"
                onClick={handleChangeEmail}
                className="shrink-0 text-xs text-ink-500 underline hover:text-ink-800"
              >
                Change
              </button>
            </div>

            <form
              onSubmit={handlePasswordSubmit}
              className="flex flex-col gap-3"
            >
              <FormLabel htmlFor="password">Password</FormLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="submit"
                disabled={
                  signInWithPassword.isPending || !password || !captchaReady
                }
              >
                {signInWithPassword.isPending ? "Signing in…" : "Continue"}
              </Button>
              {signInWithPassword.isError && (
                <p className="text-xs text-red-700">
                  {signInWithPassword.error.message}
                </p>
              )}
            </form>

            <Turnstile
              onVerify={setCaptchaToken}
              onExpire={() => setCaptchaToken(null)}
              resetKey={captchaNonce}
            />

            <Button
              variant="secondary"
              onClick={handleMagicLinkClick}
              disabled={signIn.isPending || !captchaReady}
            >
              {signIn.isPending
                ? "Sending…"
                : "Email me a sign-in link instead"}
            </Button>
            {signIn.isError && (
              <p className="text-xs text-red-700">{signIn.error.message}</p>
            )}
          </>
        )}

        {step === "sent" && (
          <p className="text-center text-sm text-ink-600">
            Check <span className="font-medium text-ink-800">{email}</span> for
            a sign-in link.
          </p>
        )}

        <p className="mt-1 text-center text-xs text-ink-400">
          By continuing you agree to our{" "}
          <a href="/terms" className="underline hover:text-ink-600">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className="underline hover:text-ink-600">
            Privacy Policy
          </a>
          .
        </p>
      </div>

      <footer className="absolute inset-x-0 bottom-6 flex justify-center gap-4 text-xs text-ink-400">
        <a href="/privacy" className="hover:text-ink-600">
          Privacy
        </a>
        <a href="/terms" className="hover:text-ink-600">
          Terms
        </a>
        <a href="/contact" className="hover:text-ink-600">
          Contact
        </a>
      </footer>
    </main>
  );
}
