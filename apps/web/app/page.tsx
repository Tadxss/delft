"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser, useSignInWithMagicLink } from "@delft/shared";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuthUser();
  const signIn = useSignInWithMagicLink();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/workspace");
    }
  }, [loading, user, router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    signIn.mutate(
      { email, redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
      { onSuccess: () => setSent(true) },
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-ink-800">Delft</h1>
        <p className="max-w-sm text-sm text-ink-500">
          Careful records. Quiet craft. One private place.
        </p>
      </div>

      <div className="w-full max-w-sm rounded-lg border border-paper-200 bg-paper-100 p-6 shadow-sm">
        {sent ? (
          <p className="text-center text-sm text-ink-600">
            Check <span className="font-medium text-ink-800">{email}</span> for a sign-in link.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
              disabled={signIn.isPending}
              className="mt-1 rounded-md bg-ink-800 px-3 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
            >
              {signIn.isPending ? "Sending…" : "Send magic link"}
            </button>
            {signIn.isError && (
              <p className="text-xs text-red-700">{signIn.error.message}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
