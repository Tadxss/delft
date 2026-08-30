"use client";

import { useEffect, useRef, useState } from "react";
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

type Step = "email" | "password" | "sent";

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
  useEffect(() => setMounted(true), []);
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
  const [awaitingGooglePopup, setAwaitingGooglePopup] = useState(false);
  const popupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // A popup we opened for Google sign-in lands back here (see handleGoogleClick's redirectTo) with
  // its own fresh session once auth completes — self-close instead of taking over that small
  // window with the workspace UI. The main tab picks up the new session via GoTrueClient's
  // cross-tab BroadcastChannel (see useSignInWithGoogle) and redirects itself below as normal.
  useEffect(() => {
    if (loading || !user) return;
    const isAuthPopup =
      typeof window !== "undefined" &&
      !!window.opener &&
      new URLSearchParams(window.location.search).has("authPopup");
    if (isAuthPopup) {
      window.close();
      return;
    }
    router.replace("/workspace");
  }, [loading, user, router]);

  // Self-clearing poll (no unmount cleanup needed — it stops itself as soon as the popup closes,
  // which happens either when the user cancels or once the popup detects its own signed-in state
  // and closes itself, see the effect above).
  function pollPopupClosed(popup: Window) {
    if (popupPollRef.current) clearInterval(popupPollRef.current);
    popupPollRef.current = setInterval(() => {
      if (popup.closed) {
        if (popupPollRef.current) clearInterval(popupPollRef.current);
        popupPollRef.current = null;
        setAwaitingGooglePopup(false);
      }
    }, 500);
  }

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
    if (!password) return;
    signInWithPassword.mutate({ email, password });
  }

  function handleMagicLinkClick() {
    signIn.mutate(
      {
        email,
        redirectTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
      },
      { onSuccess: () => setStep("sent") },
    );
  }

  async function handleGoogleClick() {
    if (typeof window === "undefined") return;
    setAwaitingGooglePopup(true);
    try {
      const url = await signInWithGoogle.mutateAsync({
        redirectTo: `${window.location.origin}/?authPopup=1`,
      });
      const width = 480;
      const height = 640;
      const left =
        window.screenX + Math.max(0, (window.outerWidth - width) / 2);
      const top =
        window.screenY + Math.max(0, (window.outerHeight - height) / 2);
      const popup = window.open(
        url,
        "crowscribe-google-signin",
        `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,status=no`,
      );
      if (!popup) {
        // Popup blocked — fall back to a full-page redirect rather than dead-ending.
        window.location.assign(url);
        return;
      }
      pollPopupClosed(popup);
    } catch {
      setAwaitingGooglePopup(false);
    }
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

      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-paper-200 bg-paper-100 p-6 shadow-sm">
        {step === "email" && (
          <>
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={signInWithGoogle.isPending || awaitingGooglePopup}
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
              {signInWithGoogle.isPending || awaitingGooglePopup
                ? "Waiting for Google…"
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
                disabled={signInWithPassword.isPending || !password}
              >
                {signInWithPassword.isPending ? "Signing in…" : "Continue"}
              </Button>
              {signInWithPassword.isError && (
                <p className="text-xs text-red-700">
                  {signInWithPassword.error.message}
                </p>
              )}
            </form>

            <Button
              variant="secondary"
              onClick={handleMagicLinkClick}
              disabled={signIn.isPending}
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
