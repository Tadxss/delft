"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  useAuthUser,
  useSignInWithGoogle,
  useSignInWithMagicLink,
  useSignInWithPassword,
} from "@delft/shared";

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
  // See ThemeToggle.tsx — resolvedTheme is undefined on the server/first client render, so the
  // Google button's colors must not depend on it until mounted, or the client's real (possibly
  // "dark") value diverges from the deterministic light-mode SSR output and React flags a
  // hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { user, loading } = useAuthUser();
  const signIn = useSignInWithMagicLink();
  const signInWithPassword = useSignInWithPassword();
  const signInWithGoogle = useSignInWithGoogle();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStep("password");
  }

  function handleChangeEmail() {
    setPassword("");
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
      { email, redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
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
      const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
      const popup = window.open(
        url,
        "delft-google-signin",
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-ink-800">Delft</h1>
        <p className="max-w-sm text-sm text-ink-500">
          Careful records. Quiet craft. One private place.
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
                  ? { backgroundColor: "#131314", borderColor: "#8e918f", color: "#e3e3e3" }
                  : { backgroundColor: "#ffffff", borderColor: "#747775", color: "#1f1f1f" }
              }
              className="flex h-10 items-center justify-center gap-3 rounded-md border text-sm font-medium tracking-wide transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <GoogleLogo />
              {signInWithGoogle.isPending || awaitingGooglePopup
                ? "Waiting for Google…"
                : "Continue with Google"}
            </button>
            {signInWithGoogle.isError && (
              <p className="-mt-2 text-xs text-red-700">{signInWithGoogle.error.message}</p>
            )}

            <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-ink-400">
              <div className="h-px flex-1 bg-paper-200" />
              or
              <div className="h-px flex-1 bg-paper-200" />
            </div>

            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
              <label htmlFor="email" className="text-xs font-medium uppercase tracking-wide text-ink-500">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
              />
              <button
                type="submit"
                disabled={!email}
                className="rounded-md bg-ink-800 px-3 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
              >
                Continue
              </button>
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

            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
              <label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-ink-500">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500"
              />
              <button
                type="submit"
                disabled={signInWithPassword.isPending || !password}
                className="rounded-md bg-ink-800 px-3 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
              >
                {signInWithPassword.isPending ? "Signing in…" : "Continue"}
              </button>
              {signInWithPassword.isError && (
                <p className="text-xs text-red-700">{signInWithPassword.error.message}</p>
              )}
            </form>

            <button
              type="button"
              onClick={handleMagicLinkClick}
              disabled={signIn.isPending}
              className="rounded-md border border-paper-200 px-3 py-2 text-sm text-ink-600 transition-colors hover:bg-paper-50 disabled:opacity-60"
            >
              {signIn.isPending ? "Sending…" : "Email me a sign-in link instead"}
            </button>
            {signIn.isError && <p className="text-xs text-red-700">{signIn.error.message}</p>}
          </>
        )}

        {step === "sent" && (
          <p className="text-center text-sm text-ink-600">
            Check <span className="font-medium text-ink-800">{email}</span> for a sign-in link.
          </p>
        )}
      </div>
    </main>
  );
}
